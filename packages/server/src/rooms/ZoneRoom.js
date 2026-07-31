/**
 * ZoneRoom — one open-world shard (Phase 1 movement + AOI lifecycle).
 *
 * - join/leave + protocol handshake
 * - MSG_MOVE → validate → apply → AOI-filtered MSG_STATE
 * - Interest enter/leave: MSG_PLAYER_JOINED / MSG_INTEREST_LEFT per observer
 * - MSG_DEFORM / MSG_SPELL → AOI-filtered events
 *
 * Fix path when broken:
 * 1. GET /health
 * 2. Confirm PROTOCOL_VERSION match on welcome
 * 3. VERBOSE_ROOM=1 for move/interest logs
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
    diffInterest,
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
    MSG_INTEREST_LEFT,
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

    /**
     * Per-observer set of other sessionIds currently in their AOI.
     * Used to emit enter/leave interest without client-side guessing.
     * @type {Map<string, Set<string>>}
     */
    #interest = new Map();

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
        this.#interest.set(client.sessionId, new Set());

        // Seed joiner's interest from current AOI (excludes self).
        const seed = this.#computeInterestIds(client.sessionId);
        this.#interest.set(client.sessionId, seed);

        client.send(MSG_WELCOME, {
            protocolVersion: PROTOCOL_VERSION,
            zoneId: this.zone.zoneId,
            sessionId: client.sessionId,
            player,
            tick: this.zone.tick,
            players: this.#snapshotFor(client.sessionId),
        });

        // Existing players who can see the joiner: enter interest + joined packet.
        for (const other of this.clients) {
            if (other.sessionId === client.sessionId) continue;
            const obs = this.zone.players[other.sessionId];
            if (!obs) continue;
            if (!inAoi(obs.x, obs.z, player.x, player.z, AOI_RADIUS_CELLS)) continue;

            let set = this.#interest.get(other.sessionId);
            if (!set) {
                set = new Set();
                this.#interest.set(other.sessionId, set);
            }
            if (!set.has(client.sessionId)) {
                set.add(client.sessionId);
                other.send(MSG_PLAYER_JOINED, {
                    sessionId: client.sessionId,
                    displayName: name,
                    player: this.#publicPlayer(player),
                    reason: "enter",
                });
            }
        }

        // Joiner already has peers in welcome.players; interest set is seeded.
        // Optionally notify joiner with explicit joined for each seed (welcome is enough).

        console.log(
            `[ZoneRoom] join ${client.sessionId} as ${name} (${this.clients.length}/${this.maxClients}) interest=${seed.size}`,
        );
    }

    onLeave(client, code) {
        const id = client.sessionId;
        ZoneState.removePlayer(this.zone, id);
        this.#lastMoveAt.delete(id);
        this.#interest.delete(id);

        // Drop id from every observer's interest set (room leave supersedes interest_left).
        for (const set of this.#interest.values()) {
            set.delete(id);
        }

        this.broadcast(MSG_PLAYER_LEFT, { sessionId: id, code });
        console.log(`[ZoneRoom] leave ${id} code=${code}`);
    }

    onDispose() {
        this.#interest.clear();
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
        // Wall-clock gap. Do NOT clamp a tiny gap up to 16ms for the speed check —
        // that turns a 2 m sample 5 ms after join into "125 m/s" and freezes the
        // player at spawn (every later step then fails MAX_MOVE_STEP from origin).
        const wallDt = Math.max(0, (now - prevT) / 1000);
        const dtSec = Math.min(0.5, Math.max(wallDt, 1 / TICK_RATE_HZ));

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
        // Only enforce speed when we have a real sample interval (not a same-tick burst).
        if (wallDt >= 1 / TICK_RATE_HZ && speed > MAX_MOVE_SPEED_MPS * 1.35) {
            if (config.verboseRoom) {
                console.warn(`[ZoneRoom] move reject speed ${speed.toFixed(1)} sid=${id}`);
            }
            return;
        }

        if (typeof payload.seq === "number" && payload.seq < player.seq) {
            return;
        }

        applyMove(player, payload, now);
        this.#lastMoveAt.set(id, now);

        // AOI lifecycle for everyone who might see / stop seeing this mover (and vice versa).
        try {
            this.#reconcileInterestForMover(id);
        } catch (err) {
            console.error(`[ZoneRoom] interest reconcile failed sid=${id}`, err);
        }

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
     * After `id` moved: update interest sets for the mover and all other players.
     * Emits MSG_INTEREST_LEFT / MSG_PLAYER_JOINED as needed.
     * @param {string} moverId
     */
    #reconcileInterestForMover(moverId) {
        const mover = this.zone.players[moverId];
        if (!mover) return;

        // 1) Mover's own view of the world
        this.#reconcileObserver(moverId);

        // 2) Every other observer: did mover enter/leave *their* AOI?
        for (const obsId of Object.keys(this.zone.players)) {
            if (obsId === moverId) continue;
            this.#reconcileObserverPair(obsId, moverId);
        }
    }

    /**
     * Full recompute of one observer's interest set vs all others.
     * @param {string} observerId
     */
    #reconcileObserver(observerId) {
        const next = this.#computeInterestIds(observerId);
        let prev = this.#interest.get(observerId);
        if (!prev) {
            prev = new Set();
            this.#interest.set(observerId, prev);
        }
        const { entered, left } = diffInterest(prev, next);
        if (!entered.length && !left.length) {
            this.#interest.set(observerId, next);
            return;
        }

        const client = this.#clientById(observerId);
        if (client) {
            for (const sid of left) {
                client.send(MSG_INTEREST_LEFT, {
                    sessionId: sid,
                    reason: "aoi",
                    tick: this.zone.tick,
                });
                if (config.verboseRoom) {
                    console.log(`[ZoneRoom] interest_left obs=${observerId} sid=${sid}`);
                }
            }
            for (const sid of entered) {
                const p = this.zone.players[sid];
                if (!p) continue;
                client.send(MSG_PLAYER_JOINED, {
                    sessionId: sid,
                    displayName: p.displayName,
                    player: this.#publicPlayer(p),
                    reason: "enter",
                });
                // Immediate pose so remote does not spawn at 0,0,0 until next move.
                client.send(MSG_STATE, {
                    tick: this.zone.tick,
                    players: [this.#publicPlayer(p)],
                });
                if (config.verboseRoom) {
                    console.log(`[ZoneRoom] interest_enter obs=${observerId} sid=${sid}`);
                }
            }
        }
        this.#interest.set(observerId, next);
    }

    /** @param {string} sessionId */
    #clientById(sessionId) {
        if (typeof this.clients.getById === "function") {
            return this.clients.getById(sessionId);
        }
        for (let i = 0; i < this.clients.length; i++) {
            if (this.clients[i].sessionId === sessionId) return this.clients[i];
        }
        return undefined;
    }

    /**
     * Cheap pair update: only whether observer sees subject (mover).
     * @param {string} observerId
     * @param {string} subjectId
     */
    #reconcileObserverPair(observerId, subjectId) {
        const obs = this.zone.players[observerId];
        const sub = this.zone.players[subjectId];
        if (!obs || !sub) return;

        let set = this.#interest.get(observerId);
        if (!set) {
            set = new Set();
            this.#interest.set(observerId, set);
        }

        const nowIn = inAoi(obs.x, obs.z, sub.x, sub.z, AOI_RADIUS_CELLS);
        const wasIn = set.has(subjectId);

        if (nowIn === wasIn) return;

        const client = this.#clientById(observerId);
        if (!client) {
            if (nowIn) set.add(subjectId);
            else set.delete(subjectId);
            return;
        }

        if (nowIn && !wasIn) {
            set.add(subjectId);
            client.send(MSG_PLAYER_JOINED, {
                sessionId: subjectId,
                displayName: sub.displayName,
                player: this.#publicPlayer(sub),
                reason: "enter",
            });
            client.send(MSG_STATE, {
                tick: this.zone.tick,
                players: [this.#publicPlayer(sub)],
            });
            if (config.verboseRoom) {
                console.log(`[ZoneRoom] interest_enter obs=${observerId} sid=${subjectId}`);
            }
        } else if (!nowIn && wasIn) {
            set.delete(subjectId);
            client.send(MSG_INTEREST_LEFT, {
                sessionId: subjectId,
                reason: "aoi",
                tick: this.zone.tick,
            });
            if (config.verboseRoom) {
                console.log(`[ZoneRoom] interest_left obs=${observerId} sid=${subjectId}`);
            }
        }
    }

    /**
     * @param {string} observerId
     * @returns {Set<string>}
     */
    #computeInterestIds(observerId) {
        const obs = this.zone.players[observerId];
        /** @type {Set<string>} */
        const set = new Set();
        if (!obs) return set;
        for (const id of Object.keys(this.zone.players)) {
            if (id === observerId) continue;
            const p = this.zone.players[id];
            if (inAoi(obs.x, obs.z, p.x, p.z, AOI_RADIUS_CELLS)) set.add(id);
        }
        return set;
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

        const d = Math.hypot(event.x - player.x, event.z - player.z);
        if (d > 8) return;

        this.#broadcastInterest(id, MSG_DEFORM_EVENT, event, true);
    }

    /**
     * @param {import('colyseus').Client} client
     * @param {object} payload
     */
    #onSpell(client, payload) {
        const id = client.sessionId;
        const player = this.zone.players[id];
        if (!player) {
            console.warn(`[ZoneRoom] spell drop sid=${id} reason=no-player`);
            return;
        }

        const event = normalizeSpellEvent({ ...payload, sessionId: id });
        if (!event) {
            console.warn(
                `[ZoneRoom] spell drop sid=${id} reason=normalize`,
                {
                    key: payload?.key,
                    phase: payload?.phase,
                    seq: payload?.seq,
                    aim: [payload?.aimX, payload?.aimY, payload?.aimZ],
                    hasTarget: Number.isFinite(payload?.targetX),
                },
            );
            return;
        }
        if (event.key === 3 || event.key === 4) {
            const targetDistance = Math.hypot(
                event.targetX - player.x,
                event.targetY - player.y,
                event.targetZ - player.z,
            );
            if (targetDistance > 25) {
                console.warn(
                    `[ZoneRoom] spell drop sid=${id} reason=target-range d=${targetDistance.toFixed(2)} key=${event.key}`,
                );
                return;
            }
        }
        if (config.verboseRoom) {
            console.log(
                `[ZoneRoom] spell ok sid=${id} key=${event.key} phase=${event.phase} seq=${event.seq}`,
            );
        }
        this.#broadcastInterest(id, MSG_SPELL_EVENT, event, true);
    }

    /**
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
            surf: p.surf ?? (p.surfing ? 1 : 0),
            carve: p.carve ?? 0,
            gaitPhase: p.gaitPhase ?? 0,
            cast: p.cast ?? 0,
            castAimX: p.castAimX ?? 0,
            castAimY: p.castAimY ?? 0,
            castAimZ: p.castAimZ ?? 1,
            air: p.air ?? 0,
            velY: p.velY ?? 0,
            jumpKind: p.jumpKind ?? 0,
            flipAngle: p.flipAngle ?? 0,
            flipTuck: p.flipTuck ?? 0,
            flipping: !!p.flipping,
            olliePhase: p.olliePhase ?? 0,
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
