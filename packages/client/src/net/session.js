/**
 * Multiplayer session stub (Phase 0).
 *
 * Does not auto-connect — keeps the offline demo intact.
 * Phase 1 will call connectZone() from main after boot and drive remote avatars.
 *
 * Fix path when net breaks:
 * 1. Server GET http://localhost:2567/health
 * 2. Compare PROTOCOL_VERSION here vs server welcome.protocolVersion
 * 3. Check Vite proxy /colyseus → :2567
 */

import { Client } from "colyseus.js";
import {
    PROTOCOL_VERSION,
    ROOM_NAME_ZONE,
    DEFAULT_ZONE_ID,
} from "@snowflow/shared";

/**
 * @typedef {object} SessionHandle
 * @property {import('colyseus.js').Client} client
 * @property {import('colyseus.js').Room | null} room
 * @property {string | null} sessionId
 * @property {() => Promise<void>} disconnect
 */

/**
 * @param {object} [opts]
 * @param {string} [opts.endpoint] default uses Vite proxy path in dev
 * @param {string} [opts.displayName]
 * @param {string} [opts.zoneId]
 * @returns {Promise<SessionHandle>}
 */
export async function connectZone(opts = {}) {
    const endpoint = opts.endpoint || defaultEndpoint();
    const client = new Client(endpoint);
    const room = await client.joinOrCreate(ROOM_NAME_ZONE, {
        displayName: opts.displayName,
        zoneId: opts.zoneId || DEFAULT_ZONE_ID,
        protocolVersion: PROTOCOL_VERSION,
    });

    const welcome = await waitMessage(room, "welcome", 5_000);
    if (welcome?.protocolVersion && welcome.protocolVersion !== PROTOCOL_VERSION) {
        await room.leave();
        throw new Error(
            `protocol mismatch: client ${PROTOCOL_VERSION} vs server ${welcome.protocolVersion}`,
        );
    }

    console.info(
        `[net] joined ${ROOM_NAME_ZONE} as ${room.sessionId} · protocol ${PROTOCOL_VERSION}`,
    );

    return {
        client,
        room,
        sessionId: room.sessionId,
        async disconnect() {
            try {
                await room.leave();
            } catch {
                /* already closed */
            }
        },
    };
}

function defaultEndpoint() {
    // Browser dev: go through Vite proxy to avoid CORS during local work.
    if (typeof location !== "undefined" && location.hostname === "localhost") {
        const proto = location.protocol === "https:" ? "wss" : "ws";
        return `${proto}://${location.host}/colyseus`;
    }
    return "ws://localhost:2567";
}

/**
 * @param {import('colyseus.js').Room} room
 * @param {string} type
 * @param {number} timeoutMs
 */
function waitMessage(room, type, timeoutMs) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => {
            room.removeAllListeners();
            reject(new Error(`timeout waiting for "${type}"`));
        }, timeoutMs);
        room.onMessage(type, (msg) => {
            clearTimeout(t);
            resolve(msg);
        });
    });
}

/** Expose protocol for overlay/debug without importing shared everywhere. */
export function getClientProtocolVersion() {
    return PROTOCOL_VERSION;
}
