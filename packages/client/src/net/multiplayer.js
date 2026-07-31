/**
 * Phase 1 multiplayer façade — wires session, remotes, prediction, deform net.
 */

import {
    connectZone,
    shouldAutoConnectMultiplayer,
    startPing,
    getClientProtocolVersion,
} from "./session.js";
import { MoveSampler } from "./prediction.js";
import { RemotePlayers } from "./remotes.js";
import { DeformNet } from "./deformNet.js";
import { SpellNet } from "./spellNet.js";

export class Multiplayer {
    /**
     * @param {object} opts
     * @param {import('@babylonjs/core/scene').Scene} opts.scene
     * @param {import('../character/controller.js').CharacterController} opts.character
     * @param {import('../core/camera.js').CameraRig} opts.rig
     * @param {import('../terrain/terrain.js').Terrain | null} [opts.terrain]
     * @param {import('../terrain/terrain.js').Terrain} opts.characterTerrain
     * @param {import('../render/sky.js').Sky} opts.sky
     * @param {import('../render/shadows.js').ShadowSystem} opts.shadows
     * @param {import('../vfx/particles.js').SprayField} opts.spray
     * @param {import('../spells/spellSystem.js').SpellSystem} opts.spells
     */
    constructor(opts) {
        this.scene = opts.scene;
        this.character = opts.character;
        this.rig = opts.rig;
        this.terrain = opts.terrain || null;
        this.characterTerrain = opts.characterTerrain || opts.terrain;
        this.sky = opts.sky;
        this.shadows = opts.shadows;
        this.spray = opts.spray;
        this.spells = opts.spells;

        /** @type {import('./session.js').SessionHandle | null} */
        this.session = null;
        /** @type {RemotePlayers | null} */
        this.remotes = null;
        this.sampler = new MoveSampler();
        this.deformNet = new DeformNet({
            field: this.terrain?.deform || null,
            getSession: () => this.session,
            getSessionId: () => this.session?.sessionId || null,
        });
        this._stopPing = null;
        // Same SessionHandle shape as DeformNet (session.send → room.send).
        // Remote spells prefer full SpellSystem (terrain off); proxy if cap/error.
        this.spellNet = new SpellNet({
            getSession: () => this.session,
            getSessionId: () => this.session?.sessionId || null,
            getRemote: (sessionId) => this.remotes?.getVisual(sessionId) || null,
            playFull: (event, origin) => {
                if (!this.spells || typeof this.spells.playVisual !== "function") return false;
                return this.spells.playVisual(event, {
                    origin,
                    applyTerrainEffect: false,
                    slotId: event.sessionId,
                });
            },
        });
        this.connected = false;
        this.lastError = null;
    }

    static shouldAutoConnect() {
        return shouldAutoConnectMultiplayer();
    }

    get protocolVersion() {
        return getClientProtocolVersion();
    }

    get remoteCount() {
        return this.remotes?.count ?? 0;
    }

    get sessionId() {
        return this.session?.sessionId || null;
    }

    get rttMs() {
        return this.session?.room?.__rttMs ?? null;
    }

    /**
     * @param {object} [opts]
     * @param {string} [opts.displayName]
     */
    async connect(opts = {}) {
        if (this.connected) return this.session;
        try {
            const session = await connectZone(opts);
            this.session = session;
            this.remotes = new RemotePlayers({
                scene: this.scene,
                localSessionId: session.sessionId,
                characterTerrain: this.characterTerrain,
                spellTerrain: this.terrain,
                sky: this.sky,
                shadows: this.shadows,
                spray: this.spray,
                onRemoteReady: (sessionId) => this.spellNet.flush(sessionId),
                onRemoteRemoved: (sessionId) => {
                    // Drop remote ribbon ownership if that peer left interest/room.
                    if (
                        this.spells &&
                        this.spells._ribbonOwner === "remote" &&
                        this.spells._remoteRibbonSid === sessionId
                    ) {
                        try {
                            this.spells.ribbon?.cancel?.();
                        } catch {
                            /* ignore */
                        }
                        this.spells._ribbonOwner = null;
                        this.spells._remoteRibbonSid = null;
                        if (this.spells.ctx) {
                            this.spells.ctx.poseOverride = null;
                            this.spells.ctx.applyTerrainEffect = true;
                        }
                    }
                },
            });
            this.remotes.bindRoom(session.room, {
                onLocalState: (p) => {
                    this.sampler.reconcileLocal(this.character, p, session.sessionId);
                },
            });
            this.remotes.seed(session.welcome?.players);
            this.deformNet.bindRoom(session.room);
            this.spellNet.bindRoom(session.room);
            if (this.spells) this.spells.onSpellEvent = (event) => this.spellNet.emit(event);
            // Re-bind deform field if terrain finished later
            if (this.terrain?.deform) {
                this.deformNet.field = this.terrain.deform;
            }
            this._stopPing = startPing(session.room);
            this.connected = true;
            this.lastError = null;
            console.info(`[mp] ready session=${session.sessionId} remotes=${this.remoteCount}`);
            return session;
        } catch (err) {
            this.lastError = err instanceof Error ? err.message : String(err);
            console.warn("[mp] connect failed:", this.lastError);
            throw err;
        }
    }

    async disconnect() {
        this._stopPing?.();
        this._stopPing = null;
        this.remotes?.dispose();
        this.remotes = null;
        if (this.session) {
            await this.session.disconnect();
            this.session = null;
        }
        if (this.spells) this.spells.onSpellEvent = null;
        this.connected = false;
    }

    /** @param {import('@babylonjs/core/Maths/math.vector').Vector3} cameraPos */
    sync(cameraPos) {
        this.remotes?.sync(cameraPos);
    }

    /**
     * Per-frame: sample local move, lerp remotes, emit foot deform,
     * refresh remote ribbon pose while peer holds key 2.
     * @param {number} dt
     */
    update(dt) {
        if (!this.connected || !this.session) return;
        this.sampler.update(dt, this.character, this.session, {
            pitch: this.rig?.pitch ?? 0,
        });
        this.remotes?.update(dt);
        this.deformNet.onLocalFootfall(this.character);

        // Keep full-system remote ribbon tip on the moving peer (hold skill).
        if (
            this.spells &&
            this.spells._ribbonOwner === "remote" &&
            this.spells._remoteRibbonSid &&
            typeof this.spells.refreshRemotePose === "function"
        ) {
            const sid = this.spells._remoteRibbonSid;
            const vis = this.remotes?.getVisual(sid);
            const pos = vis?.puppet?.position;
            if (pos) {
                this.spells.refreshRemotePose(sid, pos, vis.rig?.forward || null);
            }
        }
    }
}

export {
    connectZone,
    shouldAutoConnectMultiplayer,
    getClientProtocolVersion,
};
