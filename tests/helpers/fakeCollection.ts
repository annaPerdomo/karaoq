// A stand-in Mongo collection that actually applies its writes, so a write
// module can be asserted on the state it leaves rather than on the calls it
// makes — which is the only way to test a cap, a ranking, or idempotency.
//
// Deliberately partial: it supports the operators the corpus writers use
// ($set / $setOnInsert / $inc / $addToSet / $unset, upsert, dotted paths) and
// _id filters, and throws on anything else rather than quietly passing a test.

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

function copy<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

/** Real Mongo rejects an update whose $setOnInsert path is also written by
 *  another operator, prefixes included: { $setOnInsert: { "a.b": {} },
 *  $inc: { "a.b.c": 1 } } is an error. Applying both would leave writes green
 *  here and failing on every call in production. */
function assertNoConflict(update: UpdateSpec): void {
  const onInsert = Object.keys(update.$setOnInsert ?? {});
  if (onInsert.length === 0) return;
  const others = [update.$set, update.$inc, update.$addToSet, update.$unset]
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
    for (const path of Object.keys(update.$unset ?? {})) unsetPath(doc, path);
    docs.set(id, doc);
    return {
      matchedCount: existing ? 1 : 0,
      modifiedCount: existing ? 1 : 0,
      upsertedCount: existing ? 0 : 1,
    };
  }

  return {
    /** Deep copies on the way out, so a test holding a doc can't mutate the store. */
    all: () => Array.from(docs.values()).map((d) => copy(d)),
    get: (id: string) => {
      const doc = docs.get(id);
      return doc ? copy(doc) : null;
    },
    seed: (doc: Doc) => docs.set(doc._id, doc),
    clear: () => docs.clear(),

    findOne: async (filter: Doc, options?: { projection?: Doc }) => {
      const [id] = idsOf(filter);
      const doc = docs.get(id);
      return doc ? project(copy(doc), options?.projection) : null;
    },
    find: (filter: Doc, options?: { projection?: Doc }) => ({
      toArray: async () =>
        idsOf(filter)
          .map((id) => docs.get(id))
          .filter((d): d is Doc => Boolean(d))
          .map((d) => project(copy(d), options?.projection)),
    }),
    updateOne: async (filter: Doc, update: UpdateSpec, options?: UpdateOptions) =>
      apply(idsOf(filter)[0], update, options),
    bulkWrite: async (
      ops: { updateOne: { filter: Doc; update: UpdateSpec; upsert?: boolean } }[]
    ) => {
      let upsertedCount = 0;
      let modifiedCount = 0;
      for (const op of ops) {
        const result = apply(idsOf(op.updateOne.filter)[0], op.updateOne.update, {
          upsert: op.updateOne.upsert,
        });
        upsertedCount += result.upsertedCount;
        modifiedCount += result.modifiedCount;
      }
      return { upsertedCount, modifiedCount };
    },
    deleteOne: async (filter: Doc) => {
      const [id] = idsOf(filter);
      const had = docs.delete(id);
      return { deletedCount: had ? 1 : 0 };
    },
    createIndex: async () => "ok",
    command: async () => ({}),
  };
}

export type FakeCollection = ReturnType<typeof fakeCollection>;
