/**
 * ZoneRoom — one open-world shard.
 *
 * Phase 0: join/leave + protocol handshake + empty authoritative player map.
 * Phase 1: will apply movement messages, AOI, and deform events.
 *
 * Fix path when broken:
 * 1. GET /health on server process
 * 2. Confirm client PROTOCOL_VERSION === room.metadata.protocolVersion
 * 3. Read this file for onJoin/onLeave only — movement lives in Phase 1 handlers
 */

import { Room } from "@colyseus/core";
import {
    PROTOCOL_VERSION,
    DEFAULT_ZONE_ID,
    TICK_RATE_HZ,
    ZoneState,
    PlayerState,
} from "@snowflow/shared";
import { config } from "../app.config.js";

export class ZoneRoom extends Room {
    /** @type {import('@snowflow/shared').ZoneSnapshot | ReturnType<typeof ZoneState.create>} */
    zone = ZoneState.create();

    onCreate(options = {}) {
        this.zone = ZoneState.create({
            zoneId: options.zoneId || DEFAULT_ZONE_ID,
        });
        this.setMetadata({
            protocolVersion: PROTOCOL_VERSION,
            zoneId: this.zone.zoneId,
        });
        this.setPatchRate(1000 / (config.patchRateHz || TICK_RATE_HZ));
        this.maxClients = this.zone.maxPlayers;

        // Phase 1 will register: this.onMessage("move", ...)
        this.onMessage("ping", (client, payload) => {
            client.send("pong", {
                t: payload?.t ?? Date.now(),
                serverTick: this.zone.tick,
                protocolVersion: PROTOCOL_VERSION,
            });
        });

        this.setSimulationInterval((dtMs) => {
            this.zone.tick += 1;
            // Phase 1: integrate inputs, AOI broadcast, deform events
            void dtMs;
        }, 1000 / TICK_RATE_HZ);

        if (config.verboseRoom) {
            console.log(`[ZoneRoom] created zone=${this.zone.zoneId}`);
        }
    }

    onJoin(client, options = {}) {
        const name =
            typeof options.displayName === "string" && options.displayName.trim()
                ? options.displayName.trim().slice(0, 24)
                : `hunter-${client.sessionId.slice(0, 4)}`;

        const player = ZoneState.addPlayer(this.zone, client.sessionId, {
            displayName: name,
            updatedAt: Date.now(),
        });

        client.send("welcome", {
            protocolVersion: PROTOCOL_VERSION,
            zoneId: this.zone.zoneId,
            sessionId: client.sessionId,
            player,
            tick: this.zone.tick,
        });

        this.broadcast("player_joined", {
            sessionId: client.sessionId,
            displayName: name,
        }, { except: client });

        console.log(
            `[ZoneRoom] join ${client.sessionId} as ${name} (${this.clients.length}/${this.maxClients})`,
        );
    }

    onLeave(client, code) {
        ZoneState.removePlayer(this.zone, client.sessionId);
        this.broadcast("player_left", { sessionId: client.sessionId, code });
        console.log(`[ZoneRoom] leave ${client.sessionId} code=${code}`);
    }

    onDispose() {
        console.log(`[ZoneRoom] dispose zone=${this.zone.zoneId} tick=${this.zone.tick}`);
    }
}

// Re-export PlayerState helper for tests / future schema class mapping
export { PlayerState };
