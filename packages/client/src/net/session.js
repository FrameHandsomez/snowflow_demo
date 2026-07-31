/**
 * Multiplayer session (Phase 1).
 *
 * Does not auto-connect — opt-in via ?mp=1, localStorage, or SNOWFLOW.net.connect().
 *
 * Fix path when net breaks:
 * 1. Server GET http://localhost:2567/health
 * 2. Compare PROTOCOL_VERSION vs welcome.protocolVersion
 * 3. Check Vite proxy /colyseus → :2567
 */

import { Client } from "colyseus.js";
import {
    PROTOCOL_VERSION,
    ROOM_NAME_ZONE,
    DEFAULT_ZONE_ID,
    MSG_WELCOME,
    MSG_PONG,
    MSG_PING,
} from "@snowflow/shared";

/**
 * @typedef {object} SessionHandle
 * @property {import('colyseus.js').Client} client
 * @property {import('colyseus.js').Room} room
 * @property {string} sessionId
 * @property {object} welcome
 * @property {() => Promise<void>} disconnect
 * @property {(type: string, payload?: object) => void} send
 */

/**
 * @param {object} [opts]
 * @param {string} [opts.endpoint]
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

    const welcome = await waitMessage(room, MSG_WELCOME, 5_000);
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
        welcome,
        send(type, payload) {
            room.send(type, payload);
        },
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
    if (typeof location !== "undefined" && /localhost|127\.0\.0\.1/.test(location.hostname)) {
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
            reject(new Error(`timeout waiting for "${type}"`));
        }, timeoutMs);
        room.onMessage(type, (msg) => {
            clearTimeout(t);
            resolve(msg);
        });
    });
}

export function getClientProtocolVersion() {
    return PROTOCOL_VERSION;
}

/**
 * Opt-in multiplayer: URL ?mp=1|true or localStorage snowflow.mp=1
 * @returns {boolean}
 */
export function shouldAutoConnectMultiplayer() {
    try {
        if (typeof location !== "undefined") {
            const q = new URLSearchParams(location.search);
            const v = q.get("mp");
            if (v === "1" || v === "true") return true;
            if (v === "0" || v === "false") return false;
        }
        if (typeof localStorage !== "undefined") {
            return localStorage.getItem("snowflow.mp") === "1";
        }
    } catch {
        /* ignore */
    }
    return false;
}

/**
 * @param {import('colyseus.js').Room} room
 * @param {number} [intervalMs]
 * @returns {() => void} stop
 */
export function startPing(room, intervalMs = 5000) {
    const id = setInterval(() => {
        room.send(MSG_PING, { t: Date.now() });
    }, intervalMs);
    room.onMessage(MSG_PONG, (msg) => {
        if (msg?.t) {
            const rtt = Date.now() - msg.t;
            if (rtt > 0 && rtt < 5000) {
                room.__rttMs = rtt;
            }
        }
    });
    return () => clearInterval(id);
}
