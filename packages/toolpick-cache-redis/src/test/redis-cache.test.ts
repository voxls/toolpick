import { describe, it, expect, beforeEach, mock } from "bun:test";

const store = new Map<string, string>();
let lastSetArgs: any[] = [];
let quitCalled = false;

mock.module("ioredis", () => {
  class MockRedis {
    async get(key: string) {
      return store.get(key) ?? null;
    }
    async set(...args: any[]) {
      lastSetArgs = args;
      store.set(args[0], args[1]);
    }
    async quit() {
      quitCalled = true;
    }
  }
  return { default: MockRedis };
});

import { redisCache } from "../index.ts";

describe("redisCache", () => {
  beforeEach(() => {
    store.clear();
    lastSetArgs = [];
    quitCalled = false;
  });

  it("returns an object with load, save, and disconnect", () => {
    const cache = redisCache();
    expect(typeof cache.load).toBe("function");
    expect(typeof cache.save).toBe("function");
    expect(typeof cache.disconnect).toBe("function");
  });

  it("load returns null on cache miss", async () => {
    const cache = redisCache();
    const result = await cache.load();
    expect(result).toBeNull();
  });

  it("save stores serialized embeddings", async () => {
    const cache = redisCache();
    const embeddings = [[1, 2, 3], [4, 5, 6]];
    await cache.save(embeddings);

    expect(lastSetArgs[0]).toBe("toolpick:embeddings:vectors");
    expect(lastSetArgs[1]).toBe(JSON.stringify(embeddings));
    expect(lastSetArgs.length).toBe(2);
  });

  it("save with ttl uses EX flag", async () => {
    const cache = redisCache({ ttl: 3600 });
    await cache.save([[1, 2]]);

    expect(lastSetArgs[0]).toBe("toolpick:embeddings:vectors");
    expect(lastSetArgs[2]).toBe("EX");
    expect(lastSetArgs[3]).toBe(3600);
  });

  it("round-trips embeddings through save and load", async () => {
    const cache = redisCache();
    const embeddings = [[0.1, 0.2], [0.3, 0.4], [0.5, 0.6]];

    await cache.save(embeddings);
    const loaded = await cache.load();

    expect(loaded).toEqual(embeddings);
  });

  it("respects custom keyPrefix", async () => {
    const cache = redisCache({ keyPrefix: "myapp:" });
    await cache.save([[1]]);

    expect(lastSetArgs[0]).toBe("myapp:vectors");
  });

  it("load returns null for invalid data", async () => {
    const cache = redisCache();
    store.set("toolpick:embeddings:vectors", '"not an array"');

    const result = await cache.load();
    expect(result).toBeNull();
  });

  it("load returns null for non-2d array", async () => {
    const cache = redisCache();
    store.set("toolpick:embeddings:vectors", "[1, 2, 3]");

    const result = await cache.load();
    expect(result).toBeNull();
  });

  it("disconnect calls quit on the client", async () => {
    const cache = redisCache();
    await cache.load();
    await cache.disconnect();

    expect(quitCalled).toBe(true);
  });

  it("disconnect is a no-op when no client exists", async () => {
    const cache = redisCache();
    await cache.disconnect();

    expect(quitCalled).toBe(false);
  });
});
