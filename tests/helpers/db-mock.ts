/**
 * A chainable stand-in for a Drizzle query builder. Every method call returns
 * the same chain, and awaiting it (at any point) resolves to `result`.
 *
 *   mockSelect.mockReturnValueOnce(chain([{ id: '1' }]));
 *   await db.select().from(t).innerJoin(...).where(...).limit(1); // → [{ id: '1' }]
 */
export function chain<T>(result: T): unknown {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: T) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve(result).then(resolve, reject);
        }
        return () => proxy;
      },
    },
  );
  return proxy;
}

/** A chain that rejects with `error` when awaited. */
export function failingChain(error: Error): unknown {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (_resolve: unknown, reject: (e: unknown) => unknown) => reject(error);
        }
        return () => proxy;
      },
    },
  );
  return proxy;
}
