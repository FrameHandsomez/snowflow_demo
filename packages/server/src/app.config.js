/**
 * Server runtime config (env-overridable).
 * Keep secrets out of git — only non-secret defaults here.
 */

export const config = {
    port: Number(process.env.PORT) || 2567,
    host: process.env.HOST || "0.0.0.0",
    /** Patch rate hint for Colyseus rooms (Hz). */
    patchRateHz: Number(process.env.PATCH_RATE_HZ) || 20,
    /** Log joins/leaves — useful while debugging AOI later. */
    verboseRoom: process.env.VERBOSE_ROOM === "1",
};
