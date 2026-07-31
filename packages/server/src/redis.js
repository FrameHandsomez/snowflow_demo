/**
 * Optional Redis client (local Docker / later cloud).
 * Presence / matchmaker / multi-instance pub-sub — not required for Phase 0–1 rooms.
 */

import { Redis } from "ioredis";
import { config } from "./app.config.js";

/** @type {import("ioredis").Redis | null} */
let client = null;

/**
 * @returns {import("ioredis").Redis | null}
 */
export function getRedis() {
    return client;
}

/**
 * Connect if REDIS_URL is set. Never throws to caller — failures stay in status.
 * @returns {Promise<import("ioredis").Redis | null>}
 */
export async function connectRedis() {
    if (!config.redisUrl) {
        console.log("[redis] skipped (REDIS_URL empty)");
        return null;
    }
    if (client) return client;

    const redis = new Redis(config.redisUrl, {
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
        lazyConnect: true,
        connectTimeout: 3000,
    });

    redis.on("error", (err) => {
        // Avoid crash loops while Redis is down — health reports disconnected.
        if (config.verboseRoom) {
            console.warn("[redis] error:", err.message);
        }
    });

    try {
        await redis.connect();
        const pong = await redis.ping();
        client = redis;
        console.log(`[redis] connected · ping=${pong}`);
        return client;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[redis] connect failed: ${msg}`);
        try {
            redis.disconnect();
        } catch {
            /* ignore */
        }
        client = null;
        return null;
    }
}

/**
 * @returns {Promise<{ configured: boolean, ok: boolean, ping?: string, error?: string }>}
 */
export async function redisHealth() {
    if (!config.redisUrl) {
        return { configured: false, ok: false };
    }
    if (!client) {
        return { configured: true, ok: false, error: "not_connected" };
    }
    try {
        const ping = await client.ping();
        return { configured: true, ok: ping === "PONG", ping };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { configured: true, ok: false, error: msg };
    }
}

export async function disconnectRedis() {
    if (!client) return;
    try {
        await client.quit();
    } catch {
        try {
            client.disconnect();
        } catch {
            /* ignore */
        }
    }
    client = null;
}
