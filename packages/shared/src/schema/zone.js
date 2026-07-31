/**
 * Zone room state contract (Phase 0 scaffold / Phase 1 fill-in).
 *
 * One Colyseus room ≈ one zone instance shard.
 * Players map is keyed by sessionId.
 */

import { DEFAULT_ZONE_ID, PROTOCOL_VERSION } from "../protocol.js";
import { MAX_PLAYERS_PER_ZONE } from "../constants.js";
import { createPlayerSnapshot } from "./player.js";

/**
 * @typedef {object} ZoneSnapshot
 * @property {string} zoneId
 * @property {string} protocolVersion
 * @property {number} maxPlayers
 * @property {number} tick
 * @property {Record<string, import('./player.js').PlayerSnapshot>} players
 */

/**
 * @param {Partial<ZoneSnapshot>} [patch]
 * @returns {ZoneSnapshot}
 */
export function createZoneSnapshot(patch = {}) {
    return {
        zoneId: patch.zoneId ?? DEFAULT_ZONE_ID,
        protocolVersion: patch.protocolVersion ?? PROTOCOL_VERSION,
        maxPlayers: patch.maxPlayers ?? MAX_PLAYERS_PER_ZONE,
        tick: patch.tick ?? 0,
        players: patch.players ?? Object.create(null),
    };
}

/**
 * @param {ZoneSnapshot} zone
 * @param {string} sessionId
 * @param {Partial<import('./player.js').PlayerSnapshot>} [pose]
 */
export function addPlayer(zone, sessionId, pose = {}) {
    zone.players[sessionId] = createPlayerSnapshot(sessionId, pose);
    return zone.players[sessionId];
}

/**
 * @param {ZoneSnapshot} zone
 * @param {string} sessionId
 */
export function removePlayer(zone, sessionId) {
    delete zone.players[sessionId];
}

export const ZoneState = {
    create: createZoneSnapshot,
    addPlayer,
    removePlayer,
};
