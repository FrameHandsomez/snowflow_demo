/**
 * Client ↔ server message type names (Phase 1).
 * Keep string constants here so typos fail at import time, not at runtime.
 */

/** Client → server: authoritative pose sample after local simulation. */
export const MSG_MOVE = "move";

/** Client → server: snow deformation event (footprint / carve), not full buffer. */
export const MSG_DEFORM = "deform";

/** Client → server: latency probe. */
export const MSG_PING = "ping";

/** Server → client: latency response. */
export const MSG_PONG = "pong";

/** Server → client: join handshake. */
export const MSG_WELCOME = "welcome";

/** Server → client: another player entered interest. */
export const MSG_PLAYER_JOINED = "player_joined";

/** Server → client: player left. */
export const MSG_PLAYER_LEFT = "player_left";

/** Server → client: snapshot of players in AOI. */
export const MSG_STATE = "state";

/** Server → client: one remote deform event to apply locally. */
export const MSG_DEFORM_EVENT = "deform_event";

/** Client → server: visual spell cast/release event. */
export const MSG_SPELL = "spell";

/** Server → client: validated remote visual spell event. */
export const MSG_SPELL_EVENT = "spell_event";
