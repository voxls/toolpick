import Redis from "ioredis";
import type { RedisOptions } from "ioredis";
import type { EmbeddingCacheOptions } from "@voxls/toolpick";

export interface RedisCacheOptions {
  url?: string;
  keyPrefix?: string;
  ttl?: number;
  connection?: RedisOptions;
}

export interface RedisCache extends EmbeddingCacheOptions {
  disconnect(): Promise<void>;
}

const DEFAULT_PREFIX = "toolpick:embeddings:";
const DEFAULT_KEY = "vectors";

export function redisCache(options: RedisCacheOptions = {}): RedisCache {
  const {
    url = "redis://localhost:6379",
    keyPrefix = DEFAULT_PREFIX,
    ttl,
    connection,
  } = options;

  let client: Redis | null = null;

  function getClient(): Redis {
    if (!client) {
      client = connection ? new Redis(connection) : new Redis(url);
    }
    return client;
  }

  const key = `${keyPrefix}${DEFAULT_KEY}`;

  return {
    async load(): Promise<number[][] | null> {
      try {
        const redis = getClient();
        const data = await redis.get(key);
        if (!data) return null;

        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.every(Array.isArray)) {
          return parsed as number[][];
        }
        return null;
      } catch {
        return null;
      }
    },

    async save(embeddings: number[][]): Promise<void> {
      const redis = getClient();
      const serialized = JSON.stringify(embeddings);
      if (ttl) {
        await redis.set(key, serialized, "EX", ttl);
      } else {
        await redis.set(key, serialized);
      }
    },

    async disconnect(): Promise<void> {
      if (client) {
        await client.quit();
        client = null;
      }
    },
  };
}
