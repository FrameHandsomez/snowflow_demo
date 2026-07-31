/**
 * Server runtime config (env-overridable).
 * Keep secrets out of git — only non-secret defaults here.
 */

import "./loadEnv.js";

export const config = {
    port: Number(process.env.PORT) || 2567,
    host: process.env.HOST || "0.0.0.0",
    /** Patch rate hint for Colyseus rooms (Hz). */
    patchRateHz: Number(process.env.PATCH_RATE_HZ) || 20,
    /** Log joins/leaves — useful while debugging AOI later. */
    verboseRoom: process.env.VERBOSE_ROOM === "1",
    /**
     * Redis URL for presence / matchmaking later.
     * Local default: docker compose service on 6379.
     * Empty string disables Redis (server still boots).
     */
    redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
};
