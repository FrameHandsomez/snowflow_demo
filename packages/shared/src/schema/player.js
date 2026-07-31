/**
 * Authoritative player snapshot fields for Phase 1 movement.
 * Pure data + helpers (no Colyseus runtime required to import).
 */

/** @typedef {'idle'|'walk'|'run'|'jump'|'surf'|'air'} AnimState */

/**
 * @typedef {object} PlayerSnapshot
 * @property {string} sessionId
 * @property {string} [displayName]
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {number} yaw
 * @property {number} pitch
 * @property {AnimState} anim
 * @property {number} speed01
 * @property {number} lean
 * @property {boolean} grounded
 * @property {boolean} surfing
 * @property {number} seq
 * @property {number} updatedAt
 */

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
    "lean",
    "grounded",
    "surfing",
    "seq",
    "updatedAt",
]);

/**
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
        lean: patch.lean ?? 0,
        grounded: patch.grounded !== false,
        surfing: !!patch.surfing,
        seq: patch.seq ?? 0,
        updatedAt: patch.updatedAt ?? 0,
    };
}

/**
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

/**
 * @param {{ speed01?: number, grounded?: boolean, surfing?: boolean }} p
 * @returns {AnimState}
 */
export function inferAnim(p) {
    if (p.surfing) return "surf";
    if (p.grounded === false) return (p.speed01 ?? 0) > 0.05 ? "air" : "jump";
    if ((p.speed01 ?? 0) > 0.55) return "run";
    if ((p.speed01 ?? 0) > 0.05) return "walk";
    return "idle";
}

/**
 * @param {PlayerSnapshot} player
 * @param {Partial<PlayerSnapshot>} move
 * @param {number} [now]
 * @returns {PlayerSnapshot}
 */
export function applyMove(player, move, now = Date.now()) {
    if (typeof move.x === "number" && Number.isFinite(move.x)) player.x = move.x;
    if (typeof move.y === "number" && Number.isFinite(move.y)) player.y = move.y;
    if (typeof move.z === "number" && Number.isFinite(move.z)) player.z = move.z;
    if (typeof move.yaw === "number" && Number.isFinite(move.yaw)) player.yaw = move.yaw;
    if (typeof move.pitch === "number" && Number.isFinite(move.pitch)) player.pitch = move.pitch;
    if (typeof move.speed01 === "number" && Number.isFinite(move.speed01)) {
        player.speed01 = Math.max(0, Math.min(1, move.speed01));
    }
    if (typeof move.lean === "number" && Number.isFinite(move.lean)) {
        player.lean = Math.max(-1, Math.min(1, move.lean));
    }
    if (typeof move.grounded === "boolean") player.grounded = move.grounded;
    if (typeof move.surfing === "boolean") player.surfing = move.surfing;
    if (typeof move.seq === "number" && Number.isFinite(move.seq)) player.seq = move.seq;
    player.anim =
        move.anim && typeof move.anim === "string"
            ? /** @type {AnimState} */ (move.anim)
            : inferAnim(player);
    player.updatedAt = now;
    return player;
}

export const PlayerState = {
    fields: PLAYER_STATE_FIELDS,
    create: createPlayerSnapshot,
    isValidPose: isValidPlayerPose,
    inferAnim,
    applyMove,
};
