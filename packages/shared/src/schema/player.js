/**
 * Authoritative player snapshot fields for Phase 1 movement.
 * Pure data + helpers (no Colyseus runtime required to import).
 */

/** @typedef {'idle'|'walk'|'run'|'jump'|'surf'|'air'|'flip'|'ollie'} AnimState */

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
 * @property {number} surf 0..1 eased board blend (not just boolean)
 * @property {number} carve signed carve for surf arm asymmetry
 * @property {number} gaitPhase 0..1 walk cycle (distance-driven locally)
 * @property {number} cast 0..1 bending stance
 * @property {number} castAimX
 * @property {number} castAimY
 * @property {number} castAimZ
 * @property {number} air 0..1 airborne blend
 * @property {number} velY vertical velocity (m/s) for air pose
 * @property {number} jumpKind 0 none · 1 ground · 2 double/flip · 3 ollie
 * @property {number} flipAngle radians of front-flip root pitch
 * @property {number} flipTuck 0..1 tuck envelope
 * @property {boolean} flipping
 * @property {number} olliePhase 0..1
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
    "surf",
    "carve",
    "gaitPhase",
    "cast",
    "castAimX",
    "castAimY",
    "castAimZ",
    "air",
    "velY",
    "jumpKind",
    "flipAngle",
    "flipTuck",
    "flipping",
    "olliePhase",
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
        surf: patch.surf ?? (patch.surfing ? 1 : 0),
        carve: patch.carve ?? 0,
        gaitPhase: patch.gaitPhase ?? 0,
        cast: patch.cast ?? 0,
        castAimX: patch.castAimX ?? 0,
        castAimY: patch.castAimY ?? 0,
        castAimZ: patch.castAimZ ?? 1,
        air: patch.air ?? 0,
        velY: patch.velY ?? 0,
        jumpKind: patch.jumpKind ?? 0,
        flipAngle: patch.flipAngle ?? 0,
        flipTuck: patch.flipTuck ?? 0,
        flipping: !!patch.flipping,
        olliePhase: patch.olliePhase ?? 0,
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
 * @param {{
 *   speed01?: number,
 *   grounded?: boolean,
 *   surfing?: boolean,
 *   flipping?: boolean,
 *   jumpKind?: number,
 *   olliePhase?: number,
 * }} p
 * @returns {AnimState}
 */
export function inferAnim(p) {
    if (p.flipping || p.jumpKind === 2) return "flip";
    if ((p.olliePhase ?? 0) > 0.05 || p.jumpKind === 3) return "ollie";
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
    if (typeof move.surf === "number" && Number.isFinite(move.surf)) {
        player.surf = Math.max(0, Math.min(1, move.surf));
    } else if (typeof move.surfing === "boolean") {
        player.surf = move.surfing ? Math.max(player.surf ?? 0, 0.85) : Math.min(player.surf ?? 0, 0.15);
    }
    if (typeof move.carve === "number" && Number.isFinite(move.carve)) {
        player.carve = Math.max(-1, Math.min(1, move.carve));
    }
    if (typeof move.gaitPhase === "number" && Number.isFinite(move.gaitPhase)) {
        let g = move.gaitPhase % 1;
        if (g < 0) g += 1;
        player.gaitPhase = g;
    }
    if (typeof move.cast === "number" && Number.isFinite(move.cast)) {
        player.cast = Math.max(0, Math.min(1, move.cast));
    }
    if (typeof move.castAimX === "number" && Number.isFinite(move.castAimX)) player.castAimX = move.castAimX;
    if (typeof move.castAimY === "number" && Number.isFinite(move.castAimY)) player.castAimY = move.castAimY;
    if (typeof move.castAimZ === "number" && Number.isFinite(move.castAimZ)) player.castAimZ = move.castAimZ;
    if (typeof move.air === "number" && Number.isFinite(move.air)) {
        player.air = Math.max(0, Math.min(1, move.air));
    }
    if (typeof move.velY === "number" && Number.isFinite(move.velY)) {
        player.velY = Math.max(-40, Math.min(40, move.velY));
    }
    if (typeof move.jumpKind === "number" && Number.isFinite(move.jumpKind)) {
        player.jumpKind = Math.max(0, Math.min(3, move.jumpKind | 0));
    }
    if (typeof move.flipAngle === "number" && Number.isFinite(move.flipAngle)) {
        player.flipAngle = move.flipAngle;
    }
    if (typeof move.flipTuck === "number" && Number.isFinite(move.flipTuck)) {
        player.flipTuck = Math.max(0, Math.min(1, move.flipTuck));
    }
    if (typeof move.flipping === "boolean") player.flipping = move.flipping;
    if (typeof move.olliePhase === "number" && Number.isFinite(move.olliePhase)) {
        player.olliePhase = Math.max(0, Math.min(1, move.olliePhase));
    }
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
