/**
 * Gameplay/sim constants shared by client prediction and server authority.
 * Change here once — both sides read the same numbers.
 */

/** Server simulation tick (Colyseus patch rate should match or be a multiple). */
export const TICK_RATE_HZ = 20;

/** Soft cap per zone instance before matchmaker opens another shard. */
export const MAX_PLAYERS_PER_ZONE = 40;

/**
 * Interest-management grid cell size in metres (Phase 1 AOI).
 * Design early even with 2–3 test players — refactor later is expensive.
 */
export const AOI_CELL_SIZE_M = 64;

/**
 * Default spawn (matches shrine courtyard pad in the SNOWFLOW demo).
 * Server is authoritative; client uses this only for first-frame local pose.
 */
export const SPAWN_POSITION = Object.freeze({
    x: 0,
    y: 0,
    z: 0,
});
