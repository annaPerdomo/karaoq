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
  if (typeof condition !== "object") {
    // Mongo compares a scalar against an array field element-wise — how a dotted
    // path into an array of subdocuments picks a room out by one of its rows.
    return Array.isArray(value) ? value.indexOf(condition) >= 0 : value === condition;
  }

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

/** As in an aggregation, a path crossing an array maps over it: "$song.cuts"
 *  over a joined-but-empty `song` is [], not undefined. */
function aggPath(doc: Doc, path: string): unknown {
  return path.split(".").reduce<any>((node, key) => {
    if (node == null) return undefined;
    if (Array.isArray(node)) {
      return node.map((item) => item?.[key]).filter((v) => v !== undefined);
    }
    return node[key];
  }, doc);
}

/** Anything unsupported throws: a stage evaluating to undefined would let a
 *  mistyped field name pass as a row of zeroes. */
function aggValue(doc: Doc, node: any): any {
  if (typeof node === "string" && node.charAt(0) === "$") return aggPath(doc, node.slice(1));
  if (Array.isArray(node)) return node.map((item) => aggValue(doc, item));
  if (!node || typeof node !== "object" || node instanceof Date) return node;

  const entries = Object.entries(node);
  const operators = entries.filter(([key]) => key.charAt(0) === "$");
  if (operators.length === 0) {
    const out: Doc = {};
    for (const [key, held] of entries) out[key] = aggValue(doc, held);
    return out;
  }
  if (entries.length !== 1) {
    throw new Error(`fakeCollection: ${operators[0][0]} shares its object`);
  }

  const [op, operand] = entries[0];
  switch (op) {
    case "$ifNull": {
      const [held, fallback] = operand as [unknown, unknown];
      const value = aggValue(doc, held);
      return value === undefined || value === null ? aggValue(doc, fallback) : value;
    }
    case "$size": {
      const held = aggValue(doc, operand);
        if (!Array.isArray(held)) throw new Error("$size over a non-array");
      return held.length;
    }
    case "$objectToArray": {
      const held = aggValue(doc, operand);
      if (!held || typeof held !== "object" || Array.isArray(held)) {
        throw new Error("$objectToArray over a non-object");
      }
      return Object.entries(held).map(([k, v]) => ({ k, v }));
    }
    case "$arrayElemAt": {
      const [held, index] = operand as [unknown, number];
      const list = aggValue(doc, held);
      return Array.isArray(list) ? list[index] : undefined;
    }
    case "$gt":
    case "$gte":
    case "$lt":
    case "$lte":
    case "$eq": {
      const [a, b] = (operand as unknown[]).map((held) => aggValue(doc, held));
      const order = compare(a, b);
      if (op === "$gt") return order > 0;
      if (op === "$gte") return order >= 0;
      if (op === "$lt") return order < 0;
      if (op === "$lte") return order <= 0;
      return order === 0;
    }
    default:
      throw new Error(`fakeCollection has no aggregation operator ${op}`);
  }
}

function sorted(docs: Doc[], spec: Doc): Doc[] {
  const keys = Object.keys(spec);
  return docs.slice().sort((a, b) => {
    for (const field of keys) {
      const dir = spec[field] === -1 ? -1 : 1;
      const order = compare(aggPath(a, field), aggPath(b, field));
      if (order !== 0) return dir * order;
    }
    return 0;
  });
}

function grouped(docs: Doc[], spec: Doc): Doc[] {
  if (spec._id !== null) throw new Error("fakeCollection groups only on a null _id");
  if (docs.length === 0) return [];
  const out: Doc = { _id: null };
  for (const [field, accumulator] of Object.entries(spec)) {
    if (field === "_id") continue;
    const keys = Object.keys(accumulator as Doc);
    if (keys.length !== 1 || keys[0] !== "$sum") {
      throw new Error(`fakeCollection has no accumulator ${keys.join()}`);
    }
    const term = (accumulator as Doc).$sum;
    out[field] = docs.reduce(
      (total, doc) => total + (Number(aggValue(doc, term)) || 0),
      0
    );
  }
  return [out];
}

function projected(doc: Doc, spec: Doc): Doc {
  const out: Doc = {};
  if (spec._id === undefined || spec._id) out._id = doc._id;
  for (const [field, mode] of Object.entries(spec)) {
    if (field === "_id") continue;
    if (mode === 1 || mode === true) {
      const value = readPath(doc, field);
      if (value !== undefined) setPath(out, field, value);
      continue;
    }
    if (!mode) throw new Error("fakeCollection supports only inclusion projections");
    out[field] = aggValue(doc, mode);
  }
  return out;
}

export type LookupFrom = (name: string) => Doc[];

function runPipeline(input: Doc[], pipeline: Doc[], lookup?: LookupFrom): Doc[] {
  return pipeline.reduce<Doc[]>((docs, stage) => {
    const names = Object.keys(stage);
    if (names.length !== 1) throw new Error("fakeCollection: one operator per stage");
    const [name] = names;
    const spec = stage[name];
    switch (name) {
      case "$match":
        return docs.filter((doc) => matches(doc, spec));
      case "$addFields":
        return docs.map((doc) => {
          const out = copy(doc);
          // As in Mongo, every expression reads the stage's input: a field
          // this stage adds is not visible to the one beside it.
          for (const [field, expr] of Object.entries(spec as Doc)) {
            setPath(out, field, aggValue(doc, expr));
          }
          return out;
        });
      case "$project":
        return docs.map((doc) => projected(doc, spec));
      case "$sort":
        return sorted(docs, spec);
      case "$limit":
        return docs.slice(0, spec as number);
      case "$count":
        return docs.length === 0 ? [] : [{ [spec as string]: docs.length }];
      case "$group":
        return grouped(docs, spec);
      case "$lookup": {
        if (!lookup) throw new Error("fakeCollection was given no $lookup source");
        const { from, localField, foreignField, as } = spec as Doc;
        const foreign = lookup(from);
        return docs.map((doc) => {
          const local = aggPath(doc, localField);
          const wanted = Array.isArray(local) ? local : [local];
          const out = copy(doc);
          out[as] = foreign.filter((row) => {
            const value = aggPath(row, foreignField);
            const held = Array.isArray(value) ? value : [value];
            return held.some((one) => wanted.indexOf(one) >= 0);
          });
          return out;
        });
      }
      case "$facet": {
        const out: Doc = {};
        for (const [field, sub] of Object.entries(spec as Doc)) {
          out[field] = runPipeline(docs, sub as Doc[], lookup);
        }
        return [out];
      }
      default:
        throw new Error(`fakeCollection has no aggregation stage ${name}`);
    }
  }, input);
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

export function fakeCollection(lookup?: LookupFrom) {
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
          // Key order carries the tie-break, as it does in Mongo: the resolver
          // ranks breadth first and falls back to volume.
          const keys = Object.keys(spec);
          found = found.slice().sort((a, b) => {
            for (const field of keys) {
              const dir = spec[field] === -1 ? -1 : 1;
              const order = compare(readPath(a, field), readPath(b, field));
              if (order !== 0) return dir * order;
            }
            return 0;
          });
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
    aggregate: (pipeline: Doc[]) => ({
      toArray: async () =>
        runPipeline(
          Array.from(docs.values()).map((doc) => copy(doc)),
          pipeline,
          lookup
        ),
    }),
    createIndex: async () => "ok",
    command: async () => ({}),
  };
}

export type FakeCollection = ReturnType<typeof fakeCollection>;
