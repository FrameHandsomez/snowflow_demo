/**
 * Authoritative player snapshot fields for Phase 1 movement.
 *
 * This module is pure data + helpers (no Colyseus runtime required to import).
 * Server rooms will map these fields onto @colyseus/schema classes in Phase 1.
 * Keeping the field list here is the source of truth so client prediction,
 * reconciliation, and server state stay aligned.
 */

/** @typedef {'idle'|'walk'|'run'|'jump'|'surf'|'air'} AnimState */

/**
 * @typedef {object} PlayerSnapshot
 * @property {string} sessionId
 * @property {string} [displayName]
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {number} yaw      radians, Y-up
 * @property {number} pitch    look pitch (optional sync)
 * @property {AnimState} anim
 * @property {number} speed01  0..1 locomotion blend
 * @property {number} seq      input sequence for reconciliation
 * @property {number} updatedAt ms epoch or server tick time
 */

/** Field names that travel on the wire (order stable for docs/debug). */
export const PLAYER_STATE_FIELDS = Object.freeze([
    "sessionId",
    "displayName",
    "x",
    "y",
    "z",
    "yaw",
    "pitch",
    "anim",
    "speed01",
    "seq",
    "updatedAt",
]);

/**
 * Factory for a zeroed local player snapshot.
 * @param {string} sessionId
 * @param {Partial<PlayerSnapshot>} [patch]
 * @returns {PlayerSnapshot}
 */
export function createPlayerSnapshot(sessionId, patch = {}) {
    return {
        sessionId,
        displayName: patch.displayName ?? "hunter",
        x: patch.x ?? 0,
        y: patch.y ?? 0,
        z: patch.z ?? 0,
        yaw: patch.yaw ?? 0,
        pitch: patch.pitch ?? 0,
        anim: patch.anim ?? "idle",
        speed01: patch.speed01 ?? 0,
        seq: patch.seq ?? 0,
        updatedAt: patch.updatedAt ?? 0,
    };
}

/**
 * Shallow validate required numeric pose fields (R2 defensive check).
 * @param {Partial<PlayerSnapshot>} p
 * @returns {boolean}
 */
export function isValidPlayerPose(p) {
    if (!p || typeof p !== "object") return false;
    for (const k of ["x", "y", "z", "yaw"]) {
        if (typeof p[k] !== "number" || !Number.isFinite(p[k])) return false;
    }
    return true;
}

/** Namespace export for import { PlayerState } symmetry with ZoneState. */
export const PlayerState = {
    fields: PLAYER_STATE_FIELDS,
    create: createPlayerSnapshot,
    isValidPose: isValidPlayerPose,
};
