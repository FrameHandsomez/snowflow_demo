/**
 * @snowflow/shared — single import surface for client + server.
 *
 * Rule: anything both sides must agree on lives here.
 * If client and server disagree, fix the contract here first — not in either app.
 */

export {
    PROTOCOL_VERSION,
    ROOM_NAME_ZONE,
    DEFAULT_ZONE_ID,
} from "./protocol.js";

export {
    TICK_RATE_HZ,
    MAX_PLAYERS_PER_ZONE,
    AOI_CELL_SIZE_M,
    AOI_RADIUS_CELLS,
    MAX_MOVE_SPEED_MPS,
    MAX_MOVE_STEP_M,
    SPAWN_POSITION,
} from "./constants.js";

export {
    MSG_MOVE,
    MSG_DEFORM,
    MSG_PING,
    MSG_PONG,
    MSG_WELCOME,
    MSG_PLAYER_JOINED,
    MSG_PLAYER_LEFT,
    MSG_INTEREST_LEFT,
    MSG_STATE,
    MSG_DEFORM_EVENT,
    MSG_SPELL,
    MSG_SPELL_EVENT,
} from "./messages.js";

export { cellOf, cellChebyshev, inAoi, diffInterest } from "./aoi.js";

export {
    PlayerState,
    createPlayerSnapshot,
    isValidPlayerPose,
    inferAnim,
    applyMove,
    PLAYER_STATE_FIELDS,
} from "./schema/player.js";

export {
    ZoneState,
    createZoneSnapshot,
    addPlayer,
    removePlayer,
} from "./schema/zone.js";

export { DeformEventSchema, normalizeDeformEvent } from "./schema/deform.js";
export { normalizeSpellEvent } from "./schema/spell.js";
