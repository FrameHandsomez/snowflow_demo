/**
 * The spell system — dispatch, shared context, and the casting pose.
 *
 * Owns the five spells, the water body they draw into, the ice they leave, and
 * the light pool every material reads. One `update()` per frame, in this order,
 * and the order is load-bearing:
 *
 *   1. clear the light pool
 *   2. dispatch input
 *   3. update every spell — they declare lights and write brushes here
 *   4. upload the water and the crystals
 *
 * The lights have to be cleared before the spells run and uploaded after, or a
 * spell that ended last frame keeps lighting the snow. The brushes have to be
 * written before `terrain.update()` runs the simulation pass, which is why this
 * is called from `main` alongside the character contact rather than after the
 * terrain.
 *
 * Allocation per frame: none.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { input } from "../core/input.js";
import { S } from "../core/settings.js";
import { expDamp } from "../core/camera.js";
import { SpellLights } from "./spellLights.js";
import { WaterBody } from "./waterBody.js";
import { CrystalField } from "./crystals.js";
import { Sweep } from "./sweep.js";
import { Ribbon } from "./ribbon.js";
import { Bloom } from "./bloom.js";
import { Crystallize } from "./crystallize.js";
import { Vortex } from "./vortex.js";
import { aimPoint, clamp01 } from "./bending.js";

/**
 * @typedef {{
 *   x: number, y: number, z: number,
 *   facing: number,
 *   forward: { x:number, y:number, z:number },
 *   right: { x:number, y:number, z:number },
 *   up: { x:number, y:number, z:number },
 *   cast?: number,
 *   castAimX?: number, castAimY?: number, castAimZ?: number,
 * }} SpellPoseOverride
 *
 * @typedef {{
 *   controller: import("../character/controller.js").CharacterController,
 *   figure: import("../character/figure.js").Figure|null,
 *   rig: import("../core/camera.js").CameraRig,
 *   terrain: import("../terrain/terrain.js").Terrain,
 *   deform: import("../terrain/deformation.js").DeformationField,
 *   spray: import("../vfx/particles.js").SprayField,
 *   water: WaterBody,
 *   crystals: CrystalField,
 *   lights: SpellLights,
 *   time: number,
 *   sprayScale: number,
 *   applyTerrainEffect: boolean,
 *   poseOverride: SpellPoseOverride | null,
 *   handPosition: (which:number, out:Float32Array, off:number) => void,
 * }} SpellContext
 *
 * applyTerrainEffect=false → deform.brush no-op (remote visual; no double snow).
 * poseOverride → remote caster pose for Sweep/Ribbon/Vortex origin + aim basis.
 */

const _aim = new Float32Array(3);
const _hand = new Float32Array(3);

/** Max simultaneous full remote spell visuals (perf). Excess → RemoteSpellFx proxy. */
export const MAX_FULL_REMOTE_SPELLS = 2;

/**
 * Gate deform.brush so remote playback cannot double-write the snow buffer.
 * @param {import("../terrain/deformation.js").DeformationField} real
 * @param {() => boolean} isEnabled
 */
function gateDeform(real, isEnabled) {
    if (!real) return real;
    return new Proxy(real, {
        get(target, prop, receiver) {
            if (prop === "brush") {
                return (...args) => {
                    if (!isEnabled()) return;
                    return target.brush(...args);
                };
            }
            const v = Reflect.get(target, prop, receiver);
            return typeof v === "function" ? v.bind(target) : v;
        },
    });
}

/**
 * Gate camera trauma + prefer poseOverride basis vectors for ribbon/aim.
 * @param {import("../core/camera.js").CameraRig} real
 * @param {() => boolean} allowTrauma
 * @param {() => SpellPoseOverride | null} getPose
 */
function gateRig(real, allowTrauma, getPose) {
    return new Proxy(real, {
        get(target, prop, receiver) {
            const pose = getPose();
            if (prop === "addTrauma") {
                return (amount) => {
                    if (!allowTrauma()) return;
                    return target.addTrauma(amount);
                };
            }
            if (pose) {
                if (prop === "forward") return pose.forward;
                if (prop === "right") return pose.right;
                if (prop === "up") return pose.up;
            }
            const v = Reflect.get(target, prop, receiver);
            return typeof v === "function" ? v.bind(target) : v;
        },
    });
}

/**
 * Prefer poseOverride position/facing so Sweep/Vortex spawn at the remote caster.
 * Cast stance writes go to the override (not the local hunter).
 * @param {import("../character/controller.js").CharacterController} real
 * @param {() => SpellPoseOverride | null} getPose
 */
function gateController(real, getPose) {
    return new Proxy(real, {
        get(target, prop, receiver) {
            const pose = getPose();
            if (pose) {
                if (prop === "position") {
                    return { x: pose.x, y: pose.y, z: pose.z };
                }
                if (prop === "facing") return pose.facing;
                if (prop === "cast") return pose.cast ?? 0;
                if (prop === "castAimX") return pose.castAimX ?? pose.forward.x;
                if (prop === "castAimY") return pose.castAimY ?? pose.forward.y;
                if (prop === "castAimZ") return pose.castAimZ ?? pose.forward.z;
            }
            const v = Reflect.get(target, prop, receiver);
            return typeof v === "function" ? v.bind(target) : v;
        },
        set(target, prop, value) {
            const pose = getPose();
            if (pose && (prop === "cast" || prop === "castAimX" || prop === "castAimY" || prop === "castAimZ")) {
                pose[prop] = value;
                return true;
            }
            target[prop] = value;
            return true;
        },
    });
}

export class SpellSystem {
    /**
     * @param {import("@babylonjs/core/scene").Scene} scene
     * @param {import("../render/sky.js").Sky} sky
     * @param {import("../render/shadows.js").ShadowSystem} shadows
     * @param {import("../terrain/terrain.js").Terrain} terrain
     * @param {import("../character/controller.js").CharacterController} controller
     * @param {import("../character/figure.js").Figure|null} figure
     * @param {import("../core/camera.js").CameraRig} rig
     * @param {import("../vfx/particles.js").SprayField} spray
     * @param {{ inputEnabled?: boolean }} [opts]
     */
    constructor(scene, sky, shadows, terrain, controller, figure, rig, spray, opts = {}) {
        this.lights = new SpellLights();
        this.inputEnabled = opts.inputEnabled !== false;
        this.water = new WaterBody(scene, sky, shadows, this.lights);
        this.crystals = new CrystalField(scene, sky, shadows, this.lights);

        /** Real local hunter — never replaced; wrappers read poseOverride on top. */
        this._localController = controller;
        this._localRig = rig;

        /** @type {SpellContext} */
        this.ctx = {
            controller: null,
            figure: figure || null,
            rig: null,
            terrain,
            deform: null,
            spray,
            water: this.water,
            crystals: this.crystals,
            lights: this.lights,
            time: 0,
            sprayScale: 1,
            applyTerrainEffect: true,
            poseOverride: null,
            handPosition: (which, out, off) => this._handPosition(which, out, off),
        };

        this.ctx.controller = gateController(controller, () => this.ctx.poseOverride);
        this.ctx.rig = gateRig(
            rig,
            () => this.ctx.applyTerrainEffect !== false && !this.ctx.poseOverride,
            () => this.ctx.poseOverride,
        );
        this.ctx.deform = gateDeform(terrain.deform, () => this.ctx.applyTerrainEffect !== false);

        this.sweep = new Sweep(this.ctx);
        this.ribbon = new Ribbon(this.ctx);
        this.bloom = new Bloom(this.ctx);
        this.crystallize = new Crystallize(this.ctx);
        this.vortex = new Vortex(this.ctx);

        this.spells = [this.sweep, this.ribbon, this.bloom, this.crystallize, this.vortex];

        /**
         * Materials outside the spell system that shade with the spell lights.
         *
         * They are pushed rather than pulled because the pool is only complete
         * once every spell has declared, and that is later in the frame than any
         * of these systems runs. Registering them here keeps "who is lit by a
         * spell" a single list in one file instead of a `lights.apply()` call
         * scattered across five unrelated `_pushUniforms`.
         *
         * @type {import("@babylonjs/core/Materials/shaderMaterial").ShaderMaterial[]}
         */
        this._consumers = [];

        /** Aim direction, refreshed each frame from the rig. */
        this.aim = new Vector3(0, 0, 1);
        /** 0..1 eased: how far into a casting stance the figure should be. */
        this.castBlend = 0;
        this._lastCast = -99;
        this._time = 0;
        /** Console override for the Ribbon hold. */
        this.debugRibbon = false;
        /** Optional multiplayer hook. It receives a visual-only spell event. */
        this.onSpellEvent = null;

        /** @type {Map<string, { key: number, phase: string, until: number }>} remote full-visual slots */
        this._remoteFull = new Map();
        this._brushSkipLog = 0;
        /**
         * Who currently drives the shared Ribbon instance.
         * Local `_dispatch` polls hold every frame — without this, a peer start is
         * released on the very next frame when local key 2 is up.
         * @type {'local'|'remote'|null}
         */
        this._ribbonOwner = null;
        /** @type {string|null} remote session holding ribbon (for pose refresh) */
        this._remoteRibbonSid = null;
    }

    /**
     * Declare a material that reads `snowSpellLights`.
     * @param {...import("@babylonjs/core/Materials/shaderMaterial").ShaderMaterial} mats
     */
    addConsumers(...mats) {
        for (let i = 0; i < mats.length; i++) {
            if (mats[i]) this._consumers.push(mats[i]);
        }
    }

    /**
     * Where a hand is, in world space.
     *
     * Falls back to a point in front of the chest when the figure is hidden, so
     * a spell cast with the character switched off still comes from somewhere
     * sensible rather than from the origin.
     */
    _handPosition(which, out, off) {
        // Remote visual playback: never sample the local figure's hands — that
        // glued Ribbon (key 2) to the local hunter while peers saw nothing.
        const pose = this.ctx.poseOverride;
        if (pose) {
            const fx = Math.sin(pose.facing);
            const fz = Math.cos(pose.facing);
            const side = which === 0 ? -0.28 : 0.28;
            out[off] = pose.x + fx * 0.35 + Math.cos(pose.facing) * side;
            out[off + 1] = pose.y + 1.25;
            out[off + 2] = pose.z + fz * 0.35 - Math.sin(pose.facing) * side;
            return;
        }
        const fig = this.ctx.figure;
        if (fig && S.showCharacter !== false) {
            fig.handPosition(which, out, off);
            return;
        }
        const ch = this.ctx.controller;
        const fx = Math.sin(ch.facing);
        const fz = Math.cos(ch.facing);
        const side = which === 0 ? -0.28 : 0.28;
        out[off] = ch.position.x + fx * 0.35 + Math.cos(ch.facing) * side;
        out[off + 1] = ch.position.y + 1.25;
        out[off + 2] = ch.position.z + fz * 0.35 - Math.sin(ch.facing) * side;
    }

    /**
     * @param {number} dt
     * @param {Vector3} cameraPos
     */
    update(dt, cameraPos) {
        const ctx = this.ctx;
        this._time += dt;
        ctx.time = this._time;
        ctx.sprayScale = S.spellSpray;
        this.lights.scale = S.spellLight;

        // Expire remote full-visual slots so the concurrent cap frees up.
        if (this._remoteFull.size) {
            for (const [id, slot] of this._remoteFull) {
                if (this._time >= slot.until) this._remoteFull.delete(id);
            }
        }

        // Local aim always tracks the local camera. Remote playback steers Sweep /
        // Ribbon / Vortex through ctx.poseOverride on the gated controller/rig —
        // do not overwrite this.aim or the local hunter stops pointing correctly.
        this.aim.copyFrom(this._localRig.forward);

        this.lights.begin();

        if (S.showSpells !== false) {
            if (this.inputEnabled) this._dispatch();
        } else this._cancelAll();

        for (let i = 0; i < this.spells.length; i++) this.spells[i].update(dt);
        this._syncRibbonOwner();

        // The casting stance eases in while anything is up and out again after.
        // Nothing about it is a switch. Skip writing cast onto the local hunter
        // while we are driving a remote pose (would flash the local figure).
        const casting =
            this.ribbon.active || this._time - this._lastCast < 0.55 ? 1 : 0;
        this.castBlend = expDamp(this.castBlend, casting, casting ? 7.0 : 3.2, dt);
        if (!ctx.poseOverride) {
            const ch = this._localController;
            ch.cast = this.castBlend;
            ch.castAimX = this.aim.x;
            ch.castAimY = this.aim.y;
            ch.castAimZ = this.aim.z;
        }

        // Clear poseOverride when no remote-driven spell is still active.
        // Keep override while remote ribbon is held (hold is multi-second).
        if (
            ctx.poseOverride &&
            !this._hasActiveSpell() &&
            !(this._ribbonOwner === "remote" && this.ribbon.held)
        ) {
            ctx.poseOverride = null;
            ctx.applyTerrainEffect = true;
        }

        // Everything outside the spell system that answers a spell light, after
        // the last declaration and before anything renders.
        for (let i = 0; i < this._consumers.length; i++) {
            this.lights.apply(this._consumers[i]);
        }

        this.water.update(dt, cameraPos);
        this.crystals.update(dt, cameraPos);
    }

    /** @returns {boolean} */
    _hasActiveSpell() {
        for (let i = 0; i < this.spells.length; i++) {
            if (this.spells[i].active) return true;
        }
        return false;
    }

    /**
     * How many full remote spell visuals are currently reserved under the cap.
     * @returns {number}
     */
    get remoteFullCount() {
        return this._remoteFull.size;
    }

    _dispatch() {
        // Ribbon is a hold, so it is polled rather than edge-triggered.
        // `debugRibbon` lets the console hold it without synthesising a key
        // event — the poll would otherwise release it on the very next frame.
        this.holdRibbon(input.spellHeld2 || this.debugRibbon);
        const key = input.spellPressed;
        if (key && key !== 2) this.cast(key);
    }

    /**
     * Local input always owns terrain + camera trauma. Clears any remote pose
     * hijack so Sweep/Vortex spawn at the local hunter again.
     */
    _beginLocalAuthority() {
        this.ctx.poseOverride = null;
        this.ctx.applyTerrainEffect = true;
    }

    /**
     * Fire one spell, by key.
     *
     * Separated from the input poll so the console or a future rebind can cast
     * without synthesising a key event. `SNOWFLOW.spells` is the console handle.
     *
     * @param {number} key 1..5
     */
    cast(key) {
        this._beginLocalAuthority();
        const ctx = this.ctx;
        const rig = this._localRig;

        if (key === 2) {
            this.holdRibbon(true);
            return;
        }

        this._lastCast = this._time;

        if (key === 1) {
            this._emitSpell({ key, phase: "cast" });
            // Flat aim: the crescent runs along the ground, so a camera pointed
            // at the sky must not launch it into the air.
            const fl = Math.hypot(this.aim.x, this.aim.z) || 1;
            this.sweep.trigger(this.aim.x / fl, this.aim.z / fl);
            rig.addTrauma(0.12);
            return;
        }

        if (key === 3 || key === 4) {
            // Both are placed where the player is looking. The ray starts at the
            // eye, so what the spell hits is exactly what is under the centre of
            // the screen — which is the only targeting rule that needs no
            // explanation and no reticle.
            //
            // Capped at 22 m of ray, not the 40 the terrain could answer for.
            // Looking out across a dune field the first surface the ray meets is
            // often forty metres away on the next ridge, and a Bloom that goes
            // off over there is an effect the player has to squint at. Beyond the
            // cap the spell lands at the cap distance instead, which is always
            // in front of them and always at a size worth looking at.
            const eye = rig.camera.position;
            aimPoint(
                _aim, ctx.terrain,
                eye.x, eye.y, eye.z,
                this.aim.x, this.aim.y, this.aim.z,
                22, 13
            );
            this._emitSpell({
                key,
                phase: "cast",
                targetX: _aim[0],
                targetY: _aim[1],
                targetZ: _aim[2],
            });
            if (key === 3) this.bloom.trigger(_aim[0], _aim[1], _aim[2]);
            else this.crystallize.trigger(_aim[0], _aim[1], _aim[2]);
            return;
        }

        if (key === 5) {
            this._emitSpell({ key, phase: "cast" });
            this.vortex.trigger();
            rig.addTrauma(0.10);
        }
    }

    /**
     * Local hold poll. Never steals / releases a ribbon owned by remote playback.
     * @param {boolean} held
     */
    holdRibbon(held) {
        if (held) {
            // Local press always wins the shared ribbon instance.
            if (this._ribbonOwner === "remote") {
                this.ribbon.cancel?.();
                this._ribbonOwner = null;
                this._remoteRibbonSid = null;
            }
            if (!this.ribbon.held) {
                this._beginLocalAuthority();
                this._ribbonOwner = "local";
                this.ribbon.trigger();
                this._lastCast = this._time;
                this._emitSpell({ key: 2, phase: "start" });
            }
        } else if (this.ribbon.held && this._ribbonOwner === "local") {
            this._beginLocalAuthority();
            this.ribbon.release();
            this._emitSpell({ key: 2, phase: "release" });
            this._ribbonOwner = null;
        }
        // If owner is remote: ignore local key-up — wait for peer MSG_SPELL release.
    }

    /**
     * Keep remote ribbon tip at the moving peer while held.
     * @param {string} sessionId
     * @param {{ x:number, y:number, z:number }} origin
     * @param {{ x:number, y:number, z:number }} [aim]
     */
    refreshRemotePose(sessionId, origin, aim) {
        if (this._ribbonOwner !== "remote") return;
        if (this._remoteRibbonSid && sessionId && this._remoteRibbonSid !== sessionId) return;
        if (!this.ctx.poseOverride || !origin) return;
        const p = this.ctx.poseOverride;
        p.x = Number(origin.x) || p.x;
        p.y = Number(origin.y) || p.y;
        p.z = Number(origin.z) || p.z;
        if (aim) {
            const ax = Number(aim.x) || 0;
            const ay = Number(aim.y) || 0;
            const az = Number(aim.z) || 1;
            const al = Math.hypot(ax, ay, az) || 1;
            p.forward.x = ax / al;
            p.forward.y = ay / al;
            p.forward.z = az / al;
            p.facing = Math.atan2(p.forward.x, p.forward.z);
            p.castAimX = p.forward.x;
            p.castAimY = p.forward.y;
            p.castAimZ = p.forward.z;
            // Rebuild right/up lightly for Lissajous plane.
            let rx = -p.forward.z;
            let rz = p.forward.x;
            let rl = Math.hypot(rx, rz) || 1;
            rx /= rl;
            rz /= rl;
            p.right.x = rx;
            p.right.y = 0;
            p.right.z = rz;
            p.up.x = p.forward.y * rz;
            p.up.y = p.forward.z * rx - p.forward.x * rz;
            p.up.z = -p.forward.y * rx;
            const ul = Math.hypot(p.up.x, p.up.y, p.up.z) || 1;
            p.up.x /= ul;
            p.up.y /= ul;
            p.up.z /= ul;
        }
    }

    /** @param {object} partial */
    _emitSpell(partial) {
        if (typeof this.onSpellEvent !== "function") return;
        this.onSpellEvent({
            ...partial,
            aimX: this.aim.x,
            aimY: this.aim.y,
            aimZ: this.aim.z,
        });
    }

    /**
     * Visual-only playback for a networked spell (peer cast).
     *
     * - Does **not** emit onSpellEvent (already on the wire).
     * - `applyTerrainEffect: false` by default → deform.brush no-op (no double snow).
     * - Injects caster origin/aim so Sweep/Ribbon/Vortex do not spawn on the local hunter.
     * - Concurrent full visuals are capped; caller should fall back to RemoteSpellFx
     *   when this returns false.
     *
     * @param {import('@snowflow/shared').SpellEvent} event
     * @param {object} [opts]
     * @param {{ x:number, y:number, z:number }} [opts.origin] remote caster world pos
     * @param {boolean} [opts.applyTerrainEffect=false]
     * @param {string} [opts.slotId] stable id for concurrent cap (sessionId)
     * @returns {boolean} true if full SpellSystem accepted the cast
     */
    playVisual(event, opts = {}) {
        if (!event || !event.key) return false;

        const applyTerrain = opts.applyTerrainEffect === true;
        const origin = opts.origin || null;
        const slotId = opts.slotId || event.sessionId || `anon-${event.seq ?? 0}`;

        // Concurrent cap — only for remote (terrain-off) playback.
        if (!applyTerrain) {
            const existing = this._remoteFull.get(slotId);
            // Same peer ribbon start/release shares one slot.
            if (!existing && this._remoteFull.size >= MAX_FULL_REMOTE_SPELLS) {
                return false;
            }
        }

        const ax = Number.isFinite(event.aimX) ? event.aimX : 0;
        const ay = Number.isFinite(event.aimY) ? event.aimY : 0;
        const az = Number.isFinite(event.aimZ) ? event.aimZ : 1;
        const al = Math.hypot(ax, ay, az) || 1;
        const fx = ax / al;
        const fy = ay / al;
        const fz = az / al;

        // Camera-style basis from aim (ribbon figure-eight plane).
        let rx = -fz;
        let rz = fx;
        let rl = Math.hypot(rx, rz);
        if (rl < 1e-4) {
            rx = 1;
            rz = 0;
            rl = 1;
        } else {
            rx /= rl;
            rz /= rl;
        }
        const right = { x: rx, y: 0, z: rz };
        // up ≈ forward × right
        const up = {
            x: fy * rz - fz * 0,
            y: fz * rx - fx * rz,
            z: fx * 0 - fy * rx,
        };
        const ul = Math.hypot(up.x, up.y, up.z) || 1;
        up.x /= ul;
        up.y /= ul;
        up.z /= ul;

        const ox = origin ? Number(origin.x) || 0 : this._localController.position.x;
        const oy = origin ? Number(origin.y) || 0 : this._localController.position.y;
        const oz = origin ? Number(origin.z) || 0 : this._localController.position.z;
        const facing = Math.atan2(fx, fz);

        this.ctx.applyTerrainEffect = applyTerrain;
        this.ctx.poseOverride = {
            x: ox,
            y: oy,
            z: oz,
            facing,
            forward: { x: fx, y: fy, z: fz },
            right,
            up,
            cast: 1,
            castAimX: fx,
            castAimY: fy,
            castAimZ: fz,
        };

        this.aim.set(fx, fy, fz);
        this._lastCast = this._time;

        try {
            if (event.key === 1) {
                const flat = Math.hypot(fx, fz) || 1;
                this.sweep.trigger(fx / flat, fz / flat);
                if (this.sweep.strand < 0 || !this.sweep.active) {
                    throw new Error("sweep strand unavailable");
                }
            } else if (event.key === 2) {
                if (event.phase === "release") {
                    // Only release if we own the remote hold (or nothing is held — throw flash).
                    if (this._ribbonOwner === "local") {
                        // Local is mid-hold; don't clobber — peer release is visual-only via proxy.
                        this.ctx.poseOverride = null;
                        this.ctx.applyTerrainEffect = true;
                        return false;
                    }
                    if (!this.ribbon.held && !this.ribbon.active) {
                        this.ribbon._seeded = false;
                        this.ribbon.trigger();
                    }
                    this.ribbon.release();
                    this._ribbonOwner = null;
                    this._remoteRibbonSid = null;
                } else {
                    // Peer start: take ownership so local holdRibbon(false) cannot kill it.
                    if (this._ribbonOwner === "local" && this.ribbon.held) {
                        // Local ribbon active — refuse full path (caller → proxy).
                        this.ctx.poseOverride = null;
                        this.ctx.applyTerrainEffect = true;
                        return false;
                    }
                    this.ribbon._seeded = false;
                    this.ribbon.trigger();
                    if (this.ribbon.strand < 0 || !this.ribbon.held) {
                        throw new Error("ribbon strand unavailable");
                    }
                    this._ribbonOwner = "remote";
                    this._remoteRibbonSid = slotId;
                }
            } else if (event.key === 3) {
                this.bloom.trigger(
                    Number(event.targetX) || ox + fx * 8,
                    Number.isFinite(event.targetY) ? event.targetY : oy,
                    Number(event.targetZ) || oz + fz * 8,
                );
                if (this.bloom.strand < 0 && !this.bloom.active) {
                    throw new Error("bloom strand unavailable");
                }
            } else if (event.key === 4) {
                this.crystallize.trigger(
                    Number(event.targetX) || ox + fx * 8,
                    Number.isFinite(event.targetY) ? event.targetY : oy,
                    Number(event.targetZ) || oz + fz * 8,
                );
            } else if (event.key === 5) {
                this.vortex.trigger();
                if (this.vortex.strands?.every((s) => s < 0)) {
                    throw new Error("vortex strands unavailable");
                }
            } else {
                this.ctx.poseOverride = null;
                this.ctx.applyTerrainEffect = true;
                return false;
            }
        } catch (err) {
            console.warn("[spells] playVisual failed", err?.message || err);
            this.ctx.poseOverride = null;
            this.ctx.applyTerrainEffect = true;
            return false;
        }

        if (!applyTerrain) {
            // Ribbon hold: keep slot open until release (or long safety timeout).
            const life =
                event.key === 1 ? 2.4
                : event.key === 2
                    ? (event.phase === "release" ? 2.0 : 120)
                : event.key === 3 ? 5.2
                : event.key === 4 ? 2.5
                : 4.65;
            this._remoteFull.set(slotId, {
                key: event.key,
                phase: event.phase || "cast",
                until: this._time + life + 0.35,
            });
            if (event.key === 2 && event.phase === "release") {
                this._remoteFull.delete(slotId);
            }
        }

        return true;
    }

    /**
     * After ribbon ends (local or remote), drop owner so the next cast is clean.
     * Called from update when ribbon becomes inactive.
     */
    _syncRibbonOwner() {
        if (this._ribbonOwner && !this.ribbon.active && !this.ribbon.held) {
            this._ribbonOwner = null;
            this._remoteRibbonSid = null;
        }
    }

    /**
     * @deprecated use playVisual — kept so older call sites do not crash.
     * @param {import('@snowflow/shared').SpellEvent} event
     */
    playRemote(event) {
        return this.playVisual(event, { applyTerrainEffect: false });
    }

    _cancelAll() {
        for (let i = 0; i < this.spells.length; i++) this.spells[i].cancel();
    }

    /** Live spell count, for the overlay. */
    get activeCount() {
        let n = 0;
        for (let i = 0; i < this.spells.length; i++) if (this.spells[i].active) n++;
        return n;
    }

    /**
     * HUD snapshot for the bottom skill bar (5 slots, keys 1–5).
     * Durations match each spell's internal life constants.
     * @returns {{ id:number, name:string, active:boolean, hold:boolean, remaining:number, duration:number }[]}
     */
    hudSlots() {
        // Keep numbers here in sync with each spell file's LIFE / timeline.
        const SWEEP_LIFE = 2.4;
        const BLOOM_LIFE = 1.75 + 3.4; // LIFE + FALLOUT
        const CRYST_LIFE = 0.85 + 1.6; // plant window + active tail (cast phase)
        const VORTEX_LIFE = 0.55 + 3.0 + 1.1; // RAMP + HOLD + FADE

        const sw = this.sweep;
        const rb = this.ribbon;
        const bl = this.bloom;
        const cr = this.crystallize;
        const vx = this.vortex;

        const rem = (active, t, life) => (active ? Math.max(0, life - t) : 0);

        return [
            {
                id: 1,
                name: "Sweep",
                active: !!sw.active,
                hold: false,
                remaining: rem(sw.active, sw.t || 0, SWEEP_LIFE),
                duration: SWEEP_LIFE,
            },
            {
                id: 2,
                name: "Ribbon",
                active: !!rb.active,
                hold: !!rb.held,
                // While held: full bar. After throw: drain with blend if available.
                remaining: rb.held
                    ? 1
                    : rb.active
                        ? Math.max(0, rb.blend != null ? rb.blend : 0.5)
                        : 0,
                duration: 1,
            },
            {
                id: 3,
                name: "Bloom",
                active: !!bl.active,
                hold: false,
                remaining: rem(bl.active, bl.t || 0, BLOOM_LIFE),
                duration: BLOOM_LIFE,
            },
            {
                id: 4,
                name: "Crystallize",
                active: !!cr.active,
                hold: false,
                remaining: rem(cr.active, cr.t || 0, CRYST_LIFE),
                duration: CRYST_LIFE,
            },
            {
                id: 5,
                name: "Vortex",
                active: !!vx.active,
                hold: false,
                remaining: rem(vx.active, vx.t || 0, VORTEX_LIFE),
                duration: VORTEX_LIFE,
            },
        ];
    }

    /**
     * Register the ice formations with the depth prepass.
     *
     * Only the crystals: the water body is translucent and refractive, so a
     * depth for it would tell every screen-space consumer that the snow behind it
     * is not there — which is exactly wrong for a medium you can see through.
     *
     * @param {import("../render/depthPass.js").DepthPass} depth
     */
    registerPrepass(depth) {
        this.crystals.registerPrepass(depth);
    }

    get triangles() {
        return this.water.triangles + this.crystals.triangles;
    }

    /**
     * Compile every spell pipeline behind the loading screen.
     *
     * The first cast of any spell must not hitch, and this is the only thing
     * standing between that and a multi-hundred-millisecond freeze the first
     * time somebody presses 3. Both water profiles and the ice material are
     * exercised with real geometry — a pipeline compiled against an empty draw
     * is a warm-up that quietly covers nothing.
     */
    async warmUp(x, y, z) {
        await this.water.warmUp(x, y, z);
        await this.crystals.warmUp(x, y, z);
    }

    /**
     * Clear the warm-up geometry. Called after `main`'s warm-up frames, not
     * inside `warmUp` — the whole point is that those frames draw it.
     */
    finishWarmUp() {
        this.water.finishWarmUp();
        this.crystals.finishWarmUp();
    }

    dispose() {
        this.water.dispose();
        this.crystals.dispose();
    }
}
