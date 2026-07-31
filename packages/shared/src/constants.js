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

/** Inclusive Chebyshev cell radius for AOI (1 ⇒ 3×3 cells). */
export const AOI_RADIUS_CELLS = 1;

/**
 * Max horizontal speed the server will accept from a move sample (m/s).
 * Above SURF_MAX on client (~19.5) with headroom for lag/desync.
 */
export const MAX_MOVE_SPEED_MPS = 28;

/** Max accepted displacement per move message (metres). */
export const MAX_MOVE_STEP_M = 6;

/**
 * Default spawn (matches shrine courtyard pad in the SNOWFLOW demo).
 * Server is authoritative; client uses this only for first-frame local pose.
 */
export const SPAWN_POSITION = Object.freeze({
    x: 8,
    y: 0,
    z: -6,
});
