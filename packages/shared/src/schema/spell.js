/**
 * Lightweight visual spell event (Phase 1).
 * Gameplay damage remains server-authoritative work for Phase 2.
 */

const SPELL_KEYS = new Set([1, 2, 3, 4, 5]);
const PHASES = new Set(["cast", "start", "release"]);

/**
 * @typedef {object} SpellEvent
 * @property {string} sessionId
 * @property {number} seq
 * @property {1|2|3|4|5} key
 * @property {'cast'|'start'|'release'} phase
 * @property {number} aimX
 * @property {number} aimY
 * @property {number} aimZ
 * @property {number} [targetX]
 * @property {number} [targetY]
 * @property {number} [targetZ]
 */

/**
 * @param {Partial<SpellEvent>} raw
 * @returns {SpellEvent | null}
 */
export function normalizeSpellEvent(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (typeof raw.sessionId !== "string" || !raw.sessionId) return null;
    if (!SPELL_KEYS.has(raw.key)) return null;
    if (!PHASES.has(raw.phase)) return null;
    if (!Number.isFinite(raw.seq)) return null;

    const aimX = Number(raw.aimX);
    const aimY = Number(raw.aimY);
    const aimZ = Number(raw.aimZ);
    const aimLength = Math.hypot(aimX, aimY, aimZ);
    if (!Number.isFinite(aimLength) || aimLength < 0.25 || aimLength > 1.5) return null;

    const event = {
        sessionId: raw.sessionId,
        seq: Math.floor(raw.seq),
        key: raw.key,
        phase: raw.phase,
        aimX: aimX / aimLength,
        aimY: aimY / aimLength,
        aimZ: aimZ / aimLength,
    };

    if (raw.key === 3 || raw.key === 4) {
        for (const field of ["targetX", "targetY", "targetZ"]) {
            if (!Number.isFinite(raw[field])) return null;
        }
        event.targetX = raw.targetX;
        event.targetY = raw.targetY;
        event.targetZ = raw.targetZ;
    }

    return event;
}
