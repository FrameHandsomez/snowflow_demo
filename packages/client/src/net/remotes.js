/**
 * Remote player visuals (Phase 1).
 *
 * A remote uses the same procedural character renderer as the local hunter.
 * Network snapshots remain the source of truth; this class only smooths them.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
    MSG_STATE,
    MSG_PLAYER_JOINED,
    MSG_PLAYER_LEFT,
} from "@snowflow/shared";
import { RemoteCharacter } from "./remoteCharacter.js";

export class RemotePlayers {
    /**
     * @param {object} opts
     * @param {import('@babylonjs/core/scene').Scene} opts.scene
     * @param {string} opts.localSessionId
     * @param {import('../terrain/terrain.js').Terrain} opts.characterTerrain
     * @param {import('../terrain/terrain.js').Terrain} opts.spellTerrain
     * @param {import('../render/sky.js').Sky} opts.sky
     * @param {import('../render/shadows.js').ShadowSystem} opts.shadows
     * @param {import('../vfx/particles.js').SprayField} opts.spray
     * @param {(sessionId: string) => void} [opts.onRemoteReady] after visual is constructible
     */
    constructor(opts) {
        this.scene = opts.scene;
        this.localSessionId = opts.localSessionId;
        this.opts = opts;
        this.onRemoteReady = opts.onRemoteReady || null;
        /** @type {Map<string, object>} */
        this.map = new Map();
    }

    /**
     * @param {import('colyseus.js').Room} room
     * @param {object} [hooks]
     * @param {(p: object) => void} [hooks.onLocalState]
     */
    bindRoom(room, hooks = {}) {
        room.onMessage(MSG_STATE, (msg) => {
            const list = msg?.players;
            if (!Array.isArray(list)) return;
            for (const p of list) {
                if (!p?.sessionId) continue;
                if (p.sessionId === this.localSessionId) {
                    hooks.onLocalState?.(p);
                    continue;
                }
                this.upsert(p);
            }
        });

        room.onMessage(MSG_PLAYER_JOINED, (msg) => {
            const p = msg?.player || msg;
            if (!p?.sessionId || p.sessionId === this.localSessionId) return;
            this.upsert(p);
        });

        room.onMessage(MSG_PLAYER_LEFT, (msg) => {
            if (msg?.sessionId) this.remove(msg.sessionId);
        });
    }

    /** @param {object[]} players */
    seed(players) {
        if (!Array.isArray(players)) return;
        for (const p of players) {
            if (!p?.sessionId || p.sessionId === this.localSessionId) continue;
            this.upsert(p);
        }
    }

    /** @param {object} p server player snapshot */
    upsert(p) {
        let remote = this.map.get(p.sessionId);
        if (!remote) {
            const target = new Vector3(p.x || 0, p.y || 0, p.z || 0);
            remote = {
                sessionId: p.sessionId,
                displayName: p.displayName || "hunter",
                target,
                state: {
                    x: target.x,
                    y: target.y,
                    z: target.z,
                    yaw: p.yaw || 0,
                    speed01: p.speed01 || 0,
                    lean: p.lean || 0,
                    grounded: p.grounded !== false,
                    surfing: !!p.surfing,
                    anim: p.anim || "idle",
                    air: p.air ?? 0,
                    velY: p.velY ?? 0,
                    jumpKind: p.jumpKind ?? 0,
                    flipAngle: p.flipAngle ?? 0,
                    flipTuck: p.flipTuck ?? 0,
                    flipping: !!p.flipping,
                    olliePhase: p.olliePhase ?? 0,
                },
                visual: null,
            };
            try {
                remote.visual = new RemoteCharacter(this.opts);
                this.map.set(p.sessionId, remote);
                // Spell FX can play before cloth warm-up; flush any early spell_events.
                this.onRemoteReady?.(p.sessionId);
                remote.visual.prepare().catch((err) => {
                    console.error(
                        `[mp] remote character warm-up failed sid=${p.sessionId}`,
                        err,
                    );
                    remote.visual?.dispose();
                    this.map.delete(p.sessionId);
                });
            } catch (err) {
                console.error(
                    `[mp] remote character creation failed sid=${p.sessionId}`,
                    err,
                );
                return;
            }
        }
        remote.displayName = p.displayName || remote.displayName;
        remote.target.set(p.x || 0, p.y || 0, p.z || 0);
        remote.state.yaw = typeof p.yaw === "number" ? p.yaw : remote.state.yaw;
        remote.state.speed01 = typeof p.speed01 === "number" ? p.speed01 : remote.state.speed01;
        remote.state.lean = typeof p.lean === "number" ? p.lean : remote.state.lean;
        remote.state.grounded = p.grounded !== false;
        remote.state.surfing = !!p.surfing;
        remote.state.anim = p.anim || remote.state.anim;
        if (typeof p.air === "number") remote.state.air = p.air;
        if (typeof p.velY === "number") remote.state.velY = p.velY;
        if (typeof p.jumpKind === "number") remote.state.jumpKind = p.jumpKind;
        if (typeof p.flipAngle === "number") remote.state.flipAngle = p.flipAngle;
        if (typeof p.flipTuck === "number") remote.state.flipTuck = p.flipTuck;
        if (typeof p.flipping === "boolean") remote.state.flipping = p.flipping;
        if (typeof p.olliePhase === "number") remote.state.olliePhase = p.olliePhase;
    }

    /** @param {string} sessionId */
    remove(sessionId) {
        const remote = this.map.get(sessionId);
        if (!remote) return;
        remote.visual?.dispose();
        this.map.delete(sessionId);
    }

    /** @param {number} dt */
    update(dt) {
        const k = 1 - Math.exp(-12 * dt);
        for (const remote of this.map.values()) {
            const state = remote.state;
            state.x += (remote.target.x - state.x) * k;
            state.y += (remote.target.y - state.y) * k;
            state.z += (remote.target.z - state.z) * k;
            remote.visual?.update(state, dt);
        }
    }

    /** @param {string} sessionId */
    getVisual(sessionId) {
        return this.map.get(sessionId)?.visual || null;
    }

    /** @param {Vector3} cameraPos */
    sync(cameraPos) {
        for (const remote of this.map.values()) remote.visual?.sync(cameraPos);
    }

    dispose() {
        for (const id of [...this.map.keys()]) this.remove(id);
    }

    get count() {
        return this.map.size;
    }
}
