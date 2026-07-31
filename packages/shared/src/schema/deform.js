/**
 * Deterministic snow deformation event (Phase 1).
 * Server relays; each client applies the same brush parameters locally.
 */

/** @typedef {'foot'|'glide'|'carve'|'ollie'} DeformKind */

/**
 * @typedef {object} DeformEvent
 * @property {string} sessionId
 * @property {DeformKind} kind
 * @property {number} x
 * @property {number} z
 * @property {number} yaw
 * @property {number} radius
 * @property {number} depth 0..1 strength
 * @property {number} [seq]
 * @property {number} [t]
 */

/**
 * @param {Partial<DeformEvent> & Pick<DeformEvent,'sessionId'|'kind'|'x'|'z'>} raw
 * @returns {DeformEvent | null}
 */
export function normalizeDeformEvent(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (typeof raw.sessionId !== "string" || !raw.sessionId) return null;
    const kind = raw.kind;
    if (kind !== "foot" && kind !== "glide" && kind !== "carve" && kind !== "ollie") {
        return null;
    }
    const x = Number(raw.x);
    const z = Number(raw.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const yaw = Number.isFinite(Number(raw.yaw)) ? Number(raw.yaw) : 0;
    const radius = clamp(Number(raw.radius) || 0.22, 0.05, 2.5);
    const depth = clamp(Number(raw.depth) || 0.35, 0.02, 1);
    return {
        sessionId: raw.sessionId,
        kind,
        x,
        z,
        yaw,
        radius,
        depth,
        seq: Number.isFinite(Number(raw.seq)) ? Number(raw.seq) : 0,
        t: Number.isFinite(Number(raw.t)) ? Number(raw.t) : Date.now(),
    };
}

/** @param {number} n @param {number} lo @param {number} hi */
function clamp(n, lo, hi) {
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n));
}

export const DeformEventSchema = {
    normalize: normalizeDeformEvent,
};
