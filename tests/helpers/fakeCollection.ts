// A stand-in Mongo collection that actually applies its writes, so a cap, a
// ranking or an idempotency claim can be asserted on the state left behind.
//
// Deliberately partial: it supports the operators the corpus writers use and the
// filters they read with, and throws on anything else rather than quietly
// passing a test.

type Doc = Record<string, any>;

interface UpdateOptions {
  upsert?: boolean;
}

interface UpdateSpec {
  $set?: Doc;
  $setOnInsert?: Doc;
  $inc?: Record<string, number>;
  $addToSet?: Doc;
  $unset?: Record<string, "">;
  $pull?: Doc;
}

function setPath(doc: Doc, path: string, value: unknown): void {
  const parts = path.split(".");
  let node = doc;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (typeof node[key] !== "object" || node[key] === null) node[key] = {};
    node = node[key];
  }
  node[parts[parts.length - 1]] = value;
}

function readPath(doc: Doc, path: string): unknown {
  return path.split(".").reduce<any>((node, key) => (node == null ? node : node[key]), doc);
}

function unsetPath(doc: Doc, path: string): void {
  const parts = path.split(".");
  const parent = parts.slice(0, -1).reduce<any>((node, key) => node?.[key], doc);
  if (parent) delete parent[parts[parts.length - 1]];
}

/** Structural rather than a JSON round trip, which hands every reader a string
 *  where Mongo holds a Date — and the sweep pages on that comparison. */
function copy<T>(value: T): T {
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((item) => copy(item)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Doc = {};
    for (const [key, held] of Object.entries(value)) out[key] = copy(held);
    return out as unknown as T;
  }
  return value;
}

/** Real Mongo rejects an update whose $setOnInsert path is also written by
 *  another operator, prefixes included: { $setOnInsert: { "a.b": {} },
 *  $inc: { "a.b.c": 1 } } is an error. */
function assertNoConflict(update: UpdateSpec): void {
  const onInsert = Object.keys(update.$setOnInsert ?? {});
  if (onInsert.length === 0) return;
  const others = [update.$set, update.$inc, update.$addToSet, update.$unset, update.$pull]
    .flatMap((op) => Object.keys(op ?? {}));
  for (const a of onInsert) {
    for (const b of others) {
      if (a === b || a.indexOf(`${b}.`) === 0 || b.indexOf(`${a}.`) === 0) {
        throw new Error(`Updating the path '${b}' would create a conflict at '${a}'`);
      }
    }
  }
}

function idsOf(filter: Doc): string[] {
  const keys = Object.keys(filter);
  if (keys.length !== 1 || keys[0] !== "_id") {
    throw new Error(`fakeCollection supports only _id filters, got ${keys.join()}`);
  }
  const id = filter._id;
  if (id && typeof id === "object" && Array.isArray(id.$in)) return id.$in;
  if (typeof id === "string") return [id];
  throw new Error("fakeCollection supports only _id equality or $in");
}

function idAndGuard(filter: Doc): { id: string; guard: Doc } {
  const { _id, ...guard } = filter;
  return { id: idsOf({ _id })[0], guard };
}

/** A missing field sorts first ascending, as in Mongo — that's how an unswept
 *  row reaches the front. */
function compare(a: unknown, b: unknown): number {
  const x = a instanceof Date ? a.getTime() : a;
  const y = b instanceof Date ? b.getTime() : b;
  if (x === y) return 0;
  if (x === undefined || x === null) return -1;
  if (y === undefined || y === null) return 1;
  return (x as any) < (y as any) ? -1 : 1;
}

/** "$field" reads the doc, { $size: "$field" } counts it, { $ifNull: [a, b] }
 *  defaults it, anything else is a literal. */
function exprValue(doc: Doc, node: any): any {
  if (typeof node === "string" && node.charAt(0) === "$") return readPath(doc, node.slice(1));
  if (node && typeof node === "object" && "$ifNull" in node) {
    const [held, fallback] = node.$ifNull as [unknown, unknown];
    const value = exprValue(doc, held);
    return value === undefined || value === null ? exprValue(doc, fallback) : value;
  }
  if (node && typeof node === "object" && "$size" in node) {
    const held = exprValue(doc, node.$size);
    // Mongo errors on a $size over a missing field; a guard that means to
    // tolerate one wraps it in $ifNull, so reaching here with a non-array is
    // the test's bug and not something to paper over.
    if (!Array.isArray(held)) throw new Error("$size over a non-array");
    return held.length;
  }
  return node;
}

function matchesExpr(doc: Doc, expr: Doc): boolean {
  const entries = Object.entries(expr);
  if (entries.length !== 1) throw new Error("fakeCollection supports one $expr operator");
  const [op, operands] = entries[0];
  if (!Array.isArray(operands) || operands.length !== 2) {
    throw new Error(`fakeCollection supports only two-operand $expr, got ${op}`);
  }
  const order = compare(exprValue(doc, operands[0]), exprValue(doc, operands[1]));
  switch (op) {
    case "$eq":
      return order === 0;
    case "$lt":
      return order < 0;
    case "$lte":
      return order <= 0;
    case "$gt":
      return order > 0;
    case "$gte":
      return order >= 0;
    default:
      throw new Error(`fakeCollection has no $expr operator ${op}`);
  }
}

function matchesValue(value: unknown, condition: any): boolean {
  if (condition instanceof Date || Array.isArray(condition) || condition === null) {
    return JSON.stringify(value ?? null) === JSON.stringify(condition);
  }
  if (typeof condition !== "object") return value === condition;

  // Fields rather than operators — { videoId: { $in: [...] } } — is a predicate
  // on the element as a document, which is how $pull selects array rows.
  if (Object.keys(condition).some((key) => key.charAt(0) !== "$")) {
    return value != null && typeof value === "object"
      ? matches(value as Doc, condition)
      : false;
  }

  return Object.entries(condition).every(([op, operand]) => {
    if (op === "$in") {
      const wanted = operand as unknown[];
      // A field holding an array matches when any element is in the list.
      return Array.isArray(value)
        ? value.some((held) => wanted.indexOf(held) >= 0)
        : wanted.indexOf(value) >= 0;
    }
    if (op === "$exists") return (value !== undefined) === Boolean(operand);
    // In Mongo an absent field is not equal to the thing being ruled out.
    if (op === "$ne") return !matchesValue(value, operand);
    if (value === undefined) return false;
    switch (op) {
      case "$size":
        return Array.isArray(value) && value.length === operand;
      case "$lt":
        return compare(value, operand) < 0;
      case "$lte":
        return compare(value, operand) <= 0;
      case "$gt":
        return compare(value, operand) > 0;
      case "$gte":
        return compare(value, operand) >= 0;
      default:
        throw new Error(`fakeCollection has no operator ${op}`);
    }
  });
}

/** A path crossing an array reads the field off every element — how Mongo finds
 *  a cache entry by one of the rows it holds. */
function readMatchPath(doc: Doc, path: string): unknown {
  return path.split(".").reduce<any>((node, key) => {
    if (node == null) return node;
    if (Array.isArray(node)) {
      const held = node.map((item) => item?.[key]).filter((v) => v !== undefined);
      return held.length > 0 ? held : undefined;
    }
    return node[key];
  }, doc);
}

function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([path, condition]) => {
    if (path === "$expr") return matchesExpr(doc, condition as Doc);
    if (path === "$or") {
      return (condition as Doc[]).some((clause) => matches(doc, clause));
    }
    return matchesValue(readMatchPath(doc, path), condition);
  });
}

/** Inclusion only, _id riding along as in Mongo. Applied rather than ignored,
 *  so an unprojected read is undefined here as it is in production. */
function project(doc: Doc, projection?: Doc): Doc {
  if (!projection) return doc;
  const out: Doc = { _id: doc._id };
  for (const [path, mode] of Object.entries(projection)) {
    if (!mode) throw new Error("fakeCollection supports only inclusion projections");
    if (path === "_id") continue;
    const value = readPath(doc, path);
    if (value !== undefined) setPath(out, path, value);
  }
  return out;
}

export function fakeCollection() {
  const docs = new Map<string, Doc>();

  function apply(id: string, update: UpdateSpec, options: UpdateOptions = {}) {
    assertNoConflict(update);
    const existing = docs.get(id);
    if (!existing && !options.upsert) {
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
    }
    const doc: Doc = existing ? copy(existing) : { _id: id };
    if (!existing) {
      for (const [path, value] of Object.entries(update.$setOnInsert ?? {})) {
        setPath(doc, path, value);
      }
    }
    for (const [path, value] of Object.entries(update.$set ?? {})) {
      setPath(doc, path, value);
    }
    for (const [path, delta] of Object.entries(update.$inc ?? {})) {
      setPath(doc, path, ((readPath(doc, path) as number) ?? 0) + delta);
    }
    for (const [path, value] of Object.entries(update.$addToSet ?? {})) {
      const held = (readPath(doc, path) as unknown[]) ?? [];
      const incoming =
        value && typeof value === "object" && Array.isArray(value.$each)
          ? value.$each
          : [value];
      for (const item of incoming) if (held.indexOf(item) < 0) held.push(item);
      setPath(doc, path, held);
    }
    for (const [path, condition] of Object.entries(update.$pull ?? {})) {
      const held = (readPath(doc, path) as unknown[]) ?? [];
      setPath(doc, path, held.filter((item) => !matchesValue(item, condition)));
    }
    for (const path of Object.keys(update.$unset ?? {})) unsetPath(doc, path);
    docs.set(id, doc);
    return {
      matchedCount: existing ? 1 : 0,
      modifiedCount: existing ? 1 : 0,
      upsertedCount: existing ? 0 : 1,
    };
  }

  return {
    /** Deep copies out, so a test holding a doc can't mutate the store. */
    all: () => Array.from(docs.values()).map((d) => copy(d)),
    get: (id: string) => {
      const doc = docs.get(id);
      return doc ? copy(doc) : null;
    },
    seed: (doc: Doc) => docs.set(doc._id, doc),
    clear: () => docs.clear(),

    findOne: async (filter: Doc, options?: { projection?: Doc }) => {
      const doc = Array.from(docs.values()).find((d) => matches(d, filter));
      return doc ? project(copy(doc), options?.projection) : null;
    },
    find: (filter: Doc, options?: { projection?: Doc }) => {
      let found = Array.from(docs.values()).filter((doc) => matches(doc, filter));
      const cursor = {
        sort: (spec: Doc) => {
          const keys = Object.keys(spec);
          if (keys.length !== 1) throw new Error("fakeCollection sorts on one field");
          const [field] = keys;
          const dir = spec[field] === -1 ? -1 : 1;
          found = found
            .slice()
            .sort((a, b) => dir * compare(readPath(a, field), readPath(b, field)));
          return cursor;
        },
        limit: (n: number) => {
          found = found.slice(0, n);
          return cursor;
        },
        toArray: async () =>
          found.map((doc) => project(copy(doc), options?.projection)),
      };
      return cursor;
    },
    countDocuments: async (filter: Doc = {}) =>
      Array.from(docs.values()).filter((doc) => matches(doc, filter)).length,
    insertOne: async (doc: Doc) => {
      if (docs.has(doc._id)) {
        // The shape a conditional insert reads as "somebody else has it".
        const e: any = new Error(`E11000 duplicate key error: ${doc._id}`);
        e.code = 11000;
        throw e;
      }
      docs.set(doc._id, copy(doc));
      return { insertedId: doc._id };
    },
    updateOne: async (filter: Doc, update: UpdateSpec, options?: UpdateOptions) => {
      const { id, guard } = idAndGuard(filter);
      if (Object.keys(guard).length > 0) {
        const held = docs.get(id);
        if (!held || !matches(held, guard)) {
          return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
        }
      }
      return apply(id, update, options);
    },
    bulkWrite: async (
      ops: { updateOne: { filter: Doc; update: UpdateSpec; upsert?: boolean } }[]
    ) => {
      let upsertedCount = 0;
      let modifiedCount = 0;
      for (const op of ops) {
        // A bulk op's filter is a filter in Mongo too: applying it unconditionally
        // would pass a test the database would have skipped.
        const { id, guard } = idAndGuard(op.updateOne.filter);
        if (Object.keys(guard).length > 0) {
          const held = docs.get(id);
          if (!held || !matches(held, guard)) continue;
        }
        const result = apply(id, op.updateOne.update, {
          upsert: op.updateOne.upsert,
        });
        upsertedCount += result.upsertedCount;
        modifiedCount += result.modifiedCount;
      }
      return { upsertedCount, modifiedCount };
    },
    updateMany: async (filter: Doc, update: UpdateSpec) => {
      const ids = Array.from(docs.values())
        .filter((doc) => matches(doc, filter))
        .map((doc) => doc._id as string);
      for (const id of ids) apply(id, update);
      return { matchedCount: ids.length, modifiedCount: ids.length };
    },
    deleteOne: async (filter: Doc) => {
      const [id] = idsOf(filter);
      const had = docs.delete(id);
      return { deletedCount: had ? 1 : 0 };
    },
    deleteMany: async (filter: Doc) => {
      const ids = Array.from(docs.values())
        .filter((doc) => matches(doc, filter))
        .map((doc) => doc._id as string);
      for (const id of ids) docs.delete(id);
      return { deletedCount: ids.length };
    },
    createIndex: async () => "ok",
    command: async () => ({}),
  };
}

export type FakeCollection = ReturnType<typeof fakeCollection>;
