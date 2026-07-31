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
    SPAWN_POSITION,
} from "./constants.js";

export { PlayerState } from "./schema/player.js";
export { ZoneState } from "./schema/zone.js";
