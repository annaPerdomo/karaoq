// In-memory room_logos + rooms for lib/roomLogos and the logo/brand routes.
// fakeCollection's structural copy would flatten a Binary, so this one keeps
// docs as written and supports only the filters those callers use.

type Doc = Record<string, any>;

function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([key, cond]) => {
    const value = doc[key];
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      if ("$exists" in cond) return (value !== undefined) === cond.$exists;
      if ("$ne" in cond) return value !== cond.$ne;
      if ("$in" in cond) return (cond.$in as unknown[]).indexOf(value) >= 0;
      throw new Error(`fakeLogoStore: unsupported filter on ${key}`);
    }
    return value === cond;
  });
}

function store(idKey: string) {
  const docs: Doc[] = [];
  const indexes: { keys: Doc; options?: Doc }[] = [];
  const find = (filter: Doc) => docs.filter((d) => matches(d, filter));
  return {
    docs,
    indexes,
    createIndex: async (keys: Doc, options?: Doc) => {
      indexes.push({ keys, options });
      return "ok";
    },
    findOne: async (filter: Doc) => find(filter)[0] ?? null,
    find: (filter: Doc) => ({ toArray: async () => find(filter) }),
    insert(doc: Doc) {
      docs.push(doc);
    },
    updateOne: async (
      filter: Doc,
      update: { $set?: Doc; $setOnInsert?: Doc; $unset?: Doc },
      opts?: { upsert?: boolean }
    ) => {
      let doc = find(filter)[0];
      if (!doc) {
        if (!opts?.upsert) return { matchedCount: 0, upsertedCount: 0 };
        doc = { [idKey]: filter[idKey], ...update.$setOnInsert };
        docs.push(doc);
      }
      Object.assign(doc, update.$set);
      for (const key of Object.keys(update.$unset ?? {})) delete doc[key];
      return { matchedCount: 1 };
    },
    deleteMany: async (filter: Doc) => {
      const gone = find(filter);
      for (const doc of gone) docs.splice(docs.indexOf(doc), 1);
      return { deletedCount: gone.length };
    },
    aggregate: () => ({
      toArray: async () =>
        docs.length ? [{ total: docs.reduce((sum, d) => sum + d.size, 0) }] : [],
    }),
    distinct: async (field: string) =>
      docs.map((d) => d[field]).filter((v, i, all) => all.indexOf(v) === i),
  };
}

export type FakeStore = ReturnType<typeof store>;

export function fakeLogoStore() {
  return { logos: store("_id"), rooms: store("id") };
}
