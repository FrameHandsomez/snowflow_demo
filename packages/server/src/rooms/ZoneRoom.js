/**
 * ZoneRoom — one open-world shard (Phase 1 movement).
 *
 * - join/leave + protocol handshake
 * - MSG_MOVE → validate step/speed → apply → AOI-filtered MSG_STATE
 * - MSG_DEFORM → normalize → AOI-filtered MSG_DEFORM_EVENT
 * - MSG_SPELL → validate visual event → AOI-filtered MSG_SPELL_EVENT
 *
 * Fix path when broken:
 * 1. GET /health
 * 2. Confirm PROTOCOL_VERSION match on welcome
 * 3. Log move rejects (verboseRoom=1)
 */

import { Room } from "@colyseus/core";
import {
    PROTOCOL_VERSION,
    DEFAULT_ZONE_ID,
    TICK_RATE_HZ,
    AOI_RADIUS_CELLS,
    MAX_MOVE_SPEED_MPS,
    MAX_MOVE_STEP_M,
    ZoneState,
    PlayerState,
    applyMove,
    isValidPlayerPose,
    inAoi,
    normalizeDeformEvent,
    normalizeSpellEvent,
    MSG_MOVE,
    MSG_DEFORM,
    MSG_SPELL,
    MSG_PING,
    MSG_PONG,
    MSG_WELCOME,
    MSG_PLAYER_JOINED,
    MSG_PLAYER_LEFT,
    MSG_STATE,
    MSG_DEFORM_EVENT,
    MSG_SPELL_EVENT,
} from "@snowflow/shared";
import { config } from "../app.config.js";

export class ZoneRoom extends Room {
    /** @type {ReturnType<typeof ZoneState.create>} */
    zone = ZoneState.create();

    /** @type {Map<string, number>} last move wall-clock per session */
    #lastMoveAt = new Map();

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

        this.onMessage(MSG_PING, (client, payload) => {
            client.send(MSG_PONG, {
                t: payload?.t ?? Date.now(),
                serverTick: this.zone.tick,
                protocolVersion: PROTOCOL_VERSION,
            });
        });

        this.onMessage(MSG_MOVE, (client, payload) => {
            this.#onMove(client, payload);
        });

        this.onMessage(MSG_DEFORM, (client, payload) => {
            this.#onDeform(client, payload);
        });

        this.onMessage(MSG_SPELL, (client, payload) => {
            this.#onSpell(client, payload);
        });

        this.setSimulationInterval(() => {
            this.zone.tick += 1;
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
        this.#lastMoveAt.set(client.sessionId, Date.now());

        client.send(MSG_WELCOME, {
            protocolVersion: PROTOCOL_VERSION,
            zoneId: this.zone.zoneId,
            sessionId: client.sessionId,
            player,
            tick: this.zone.tick,
            players: this.#snapshotFor(client.sessionId),
        });

        this.#broadcastInterest(
            client.sessionId,
            MSG_PLAYER_JOINED,
            {
                sessionId: client.sessionId,
                displayName: name,
                player,
            },
            true,
        );

        console.log(
            `[ZoneRoom] join ${client.sessionId} as ${name} (${this.clients.length}/${this.maxClients})`,
        );
    }

    onLeave(client, code) {
        ZoneState.removePlayer(this.zone, client.sessionId);
        this.#lastMoveAt.delete(client.sessionId);
        this.broadcast(MSG_PLAYER_LEFT, { sessionId: client.sessionId, code });
        console.log(`[ZoneRoom] leave ${client.sessionId} code=${code}`);
    }

    onDispose() {
        console.log(`[ZoneRoom] dispose zone=${this.zone.zoneId} tick=${this.zone.tick}`);
    }

    /**
     * @param {import('colyseus').Client} client
     * @param {object} payload
     */
    #onMove(client, payload) {
        const id = client.sessionId;
        const player = this.zone.players[id];
        if (!player) return;
        if (!payload || typeof payload !== "object") return;
        if (!isValidPlayerPose(payload)) return;

        const now = Date.now();
        const prevT = this.#lastMoveAt.get(id) || now;
        const dtSec = Math.max(0.016, Math.min(0.5, (now - prevT) / 1000));

        const dx = payload.x - player.x;
        const dz = payload.z - player.z;
        const dist = Math.hypot(dx, dz);
        if (dist > MAX_MOVE_STEP_M) {
            if (config.verboseRoom) {
                console.warn(`[ZoneRoom] move reject step ${dist.toFixed(2)}m sid=${id}`);
            }
            return;
        }
        const speed = dist / dtSec;
        if (speed > MAX_MOVE_SPEED_MPS * 1.35) {
            if (config.verboseRoom) {
                console.warn(`[ZoneRoom] move reject speed ${speed.toFixed(1)} sid=${id}`);
            }
            return;
        }

        // seq must advance (or equal first frame)
        if (typeof payload.seq === "number" && payload.seq < player.seq) {
            return;
        }

        applyMove(player, payload, now);
        this.#lastMoveAt.set(id, now);

        this.#broadcastInterest(
            id,
            MSG_STATE,
            {
                tick: this.zone.tick,
                players: [this.#publicPlayer(player)],
            },
            false,
        );
    }

    /**
     * @param {import('colyseus').Client} client
     * @param {object} payload
     */
    #onDeform(client, payload) {
        const id = client.sessionId;
        const player = this.zone.players[id];
        if (!player) return;

        const event = normalizeDeformEvent({
            ...payload,
            sessionId: id,
        });
        if (!event) return;

        // Soft clamp: deform origin must be near the player's pose
        const d = Math.hypot(event.x - player.x, event.z - player.z);
        if (d > 8) return;

        this.#broadcastInterest(id, MSG_DEFORM_EVENT, event, true);
    }

    /**
     * Validate visual spell data. Damage/cooldown authority belongs to Phase 2.
     * @param {import('colyseus').Client} client
     * @param {object} payload
     */
    #onSpell(client, payload) {
        const id = client.sessionId;
        const player = this.zone.players[id];
        if (!player) return;

        const event = normalizeSpellEvent({ ...payload, sessionId: id });
        if (!event) return;
        if (event.key === 3 || event.key === 4) {
            const targetDistance = Math.hypot(
                event.targetX - player.x,
                event.targetY - player.y,
                event.targetZ - player.z,
            );
            if (targetDistance > 25) return;
        }
        this.#broadcastInterest(id, MSG_SPELL_EVENT, event, true);
    }

    /**
     * Players visible to observer (including self).
     * @param {string} observerId
     */
    #snapshotFor(observerId) {
        const obs = this.zone.players[observerId];
        /** @type {ReturnType<ZoneRoom['#publicPlayer']>[]} */
        const list = [];
        for (const id of Object.keys(this.zone.players)) {
            const p = this.zone.players[id];
            if (!obs || id === observerId || inAoi(obs.x, obs.z, p.x, p.z, AOI_RADIUS_CELLS)) {
                list.push(this.#publicPlayer(p));
            }
        }
        return list;
    }

    /** @param {import('@snowflow/shared').PlayerSnapshot | object} p */
    #publicPlayer(p) {
        return {
            sessionId: p.sessionId,
            displayName: p.displayName,
            x: p.x,
            y: p.y,
            z: p.z,
            yaw: p.yaw,
            pitch: p.pitch,
            anim: p.anim,
            speed01: p.speed01,
            lean: p.lean,
            grounded: p.grounded,
            surfing: p.surfing,
            seq: p.seq,
            updatedAt: p.updatedAt,
        };
    }

    /**
     * Send to clients who have the source player in AOI.
     * @param {string} sourceId
     * @param {string} type
     * @param {object} message
     * @param {boolean} excludeSource
     */
    #broadcastInterest(sourceId, type, message, excludeSource) {
        const src = this.zone.players[sourceId];
        if (!src) {
            if (!excludeSource) this.broadcast(type, message);
            return;
        }
        for (const client of this.clients) {
            if (excludeSource && client.sessionId === sourceId) continue;
            const obs = this.zone.players[client.sessionId];
            if (!obs) continue;
            if (
                client.sessionId === sourceId ||
                inAoi(obs.x, obs.z, src.x, src.z, AOI_RADIUS_CELLS)
            ) {
                client.send(type, message);
            }
        }
    }
}

export { PlayerState };
