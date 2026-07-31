/**
 * Remote character visual state.
 * Mirrors network snapshots into the procedural Character renderer.
 * Never reads local input or runs collision.
 *
 * Pose fidelity (0.3.3+):
 * - surf blend + carve for board stance / arm asymmetry
 * - cast + castAim for bending hands while spells play (incl. while surfing)
 * - gaitPhase from net when walking; distance-driven fallback when missing
 * - stepping matches local controller rules (no run-gait while surfing)
 *
 * Snow fidelity (local observer):
 * - SnowContact + SurfWake driven from the puppet pose so peers leave
 *   grooves / berms / plume on *this* client's terrain (no extra wire).
 * - DeformNet still handles discrete foot stamps from the authority path.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Character } from "../character/character.js";
import { SnowContact } from "../character/snowContact.js";
import { SurfWake } from "../vfx/surfWake.js";
import { RemoteSpellFx } from "./remoteSpellFx.js";

/** Match local SURF_MAX — speed01 is normalised against this on the controller. */
const REMOTE_SPEED_REF = 19.5;

function expDamp(current, target, lambda, dt) {
    return current + (target - current) * (1 - Math.exp(-lambda * Math.max(0, dt)));
}

export class RemoteCharacter {
    /**
     * @param {object} opts
     * @param {import('@babylonjs/core/scene').Scene} opts.scene
     * @param {import('../terrain/terrain.js').Terrain} opts.characterTerrain
     * @param {import('../terrain/terrain.js').Terrain} [opts.spellTerrain]
     * @param {import('../render/sky.js').Sky} opts.sky
     * @param {import('../render/shadows.js').ShadowSystem} opts.shadows
     * @param {import('../vfx/particles.js').SprayField} [opts.spray]
     */
    constructor(opts) {
        this.puppet = {
            position: new Vector3(),
            velocity: new Vector3(),
            acceleration: new Vector3(),
            facing: 0,
            speed: 0,
            speed01: 0,
            surf: 0,
            surfActive: false,
            cast: 0,
            castAimX: 0,
            castAimY: 0,
            castAimZ: 1,
            lean: 0,
            carve: 0,
            gaitPhase: 0,
            stepping: false,
            grounded: true,
            air: 0,
            velY: 0,
            jumpPulse: 0,
            jumpKind: 0,
            landPulse: 0,
            flipping: false,
            flipAngle: 0,
            flipTuck: 0,
            surfAir: 0,
            olliePhase: 0,
            // SnowContact footfall path (figure plants preferred when present).
            footfall: false,
            footIndex: 0,
            footPos: { x: 0, y: 0, z: 0 },
        };
        this.visual = new Character(
            opts.scene,
            opts.characterTerrain,
            opts.sky,
            opts.shadows,
            this.puppet,
            { castShadows: false },
        );
        this.rig = {
            forward: new Vector3(0, 0, 1),
            camera: { position: new Vector3() },
            addTrauma() {},
        };
        // Proxy meshes when full SpellSystem is at cap / fails.
        this.spells = new RemoteSpellFx(opts.scene);

        // World snow for this observer: stamp + wake from the puppet pose.
        // spellTerrain is the full deform-capable field; characterTerrain is shrine.
        const worldTerrain = opts.spellTerrain || opts.characterTerrain || null;
        const deform = worldTerrain?.deform || null;
        const spray = opts.spray || null;
        this.contact =
            deform
                ? new SnowContact(this.puppet, deform, this.visual.figure, spray)
                : null;
        this.wake =
            worldTerrain && opts.sky && opts.shadows
                ? new SurfWake(
                    opts.scene,
                    opts.sky,
                    opts.shadows,
                    this.puppet,
                    spray,
                    worldTerrain,
                )
                : null;
        if (this.wake) this.wake.setEnabled(true);

        this._lastX = 0;
        this._lastY = 0;
        this._lastZ = 0;
        this._initialized = false;
        this.ready = false;
        this._castHold = 0;
        /** Local observer camera — set from `sync()` for wake fog/shadows. */
        this._observerCam = new Vector3();
        this.visual.setVisible(false);
    }

    /**
     * Compile the remote character materials after the main loading screen.
     * Remote players are created when a peer joins, so they miss boot warm-up.
     */
    async prepare() {
        await this.visual.warmUp();
        if (this.wake && typeof this.wake.warmUp === "function") {
            try {
                await this.wake.warmUp();
            } catch (err) {
                console.warn("[mp] remote surf wake warm-up failed", err);
            }
        }
        this.ready = true;
        this.visual.setVisible(true);
    }

    /** @param {object} state @param {number} dt */
    update(state, dt) {
        const p = this.puppet;
        const safeDt = Math.max(1 / 120, Math.min(1 / 20, dt || 1 / 60));
        const dx = state.x - this._lastX;
        const dy = state.y - this._lastY;
        const dz = state.z - this._lastZ;
        const dist = Math.hypot(dx, dz);

        p.position.set(
            Number.isFinite(state.x) ? state.x : 0,
            Number.isFinite(state.y) ? state.y : 0,
            Number.isFinite(state.z) ? state.z : 0,
        );
        if (this._initialized) {
            p.velocity.set(dx / safeDt, dy / safeDt, dz / safeDt);
        } else {
            p.velocity.set(0, 0, 0);
            this._initialized = true;
        }
        p.acceleration.set(0, 0, 0);
        p.facing = state.yaw;
        p.speed01 = typeof state.speed01 === "number" ? state.speed01 : 0;
        p.speed = p.speed01 * REMOTE_SPEED_REF;
        p.lean = typeof state.lean === "number" ? state.lean : 0;

        // --- surf: board stance must read clearly on peers ---
        // Prefer eased `surf` from net; force a high floor when surfing/anim=surf
        // so a laggy sample or boolean-only peer still shows board pitch + feet.
        let surfTarget =
            typeof state.surf === "number"
                ? state.surf
                : state.surfing || state.anim === "surf"
                    ? 1
                    : 0;
        if (state.surfing || state.anim === "surf") {
            surfTarget = Math.max(surfTarget, 0.92);
        }
        // Snappy engage, slower release (matches local 2.6 / 3.4 feel, a bit faster for net).
        p.surf = expDamp(
            p.surf,
            surfTarget,
            surfTarget > 0.5 ? 9 : 4.5,
            safeDt,
        );
        p.surfActive = p.surf > 0.4 || !!state.surfing || state.anim === "surf";
        const carveTarget =
            typeof state.carve === "number" ? state.carve : p.lean * Math.max(p.surf, 0.35);
        p.carve = expDamp(p.carve || 0, carveTarget, 10, safeDt);

        p.grounded = state.grounded !== false;
        p.air =
            typeof state.air === "number" ? state.air : p.grounded ? 0 : 1;
        p.velY = typeof state.velY === "number" ? state.velY : dy / safeDt;
        p.jumpKind = state.jumpKind | 0;
        p.flipAngle = typeof state.flipAngle === "number" ? state.flipAngle : 0;
        p.flipTuck = typeof state.flipTuck === "number" ? state.flipTuck : 0;
        p.flipping =
            !!state.flipping || state.anim === "flip" || p.jumpKind === 2;
        p.olliePhase = typeof state.olliePhase === "number" ? state.olliePhase : 0;
        p.surfAir =
            p.olliePhase > 0.05 || p.jumpKind === 3
                ? Math.max(p.surfAir, 0.85)
                : expDamp(p.surfAir, p.surf > 0.5 && !p.grounded ? 0.6 : 0, 8, safeDt);

        if (p.jumpKind > 0 && p.jumpPulse < 0.2) p.jumpPulse = 0.55;
        else p.jumpPulse = Math.max(0, p.jumpPulse - safeDt * 3.5);

        // --- cast stance: network sample + short hold after spell event ---
        const netCast = typeof state.cast === "number" ? state.cast : 0;
        if (this._castHold > 0) this._castHold = Math.max(0, this._castHold - safeDt);
        const castTarget = Math.max(netCast, this._castHold > 0 ? 1 : 0);
        p.cast = expDamp(p.cast, castTarget, castTarget > 0.5 ? 10 : 4, safeDt);
        if (typeof state.castAimX === "number") {
            const ax = state.castAimX;
            const ay = state.castAimY ?? 0;
            const az = state.castAimZ ?? 1;
            const al = Math.hypot(ax, ay, az) || 1;
            p.castAimX = ax / al;
            p.castAimY = ay / al;
            p.castAimZ = az / al;
            this.rig.forward.set(p.castAimX, p.castAimY, p.castAimZ);
        }

        // --- legs: match local controller — no gait while surfing / airborne ---
        p.stepping =
            p.grounded &&
            p.air < 0.35 &&
            p.surf <= 0.5 &&
            !p.flipping &&
            p.speed > 0.15 &&
            (state.anim === "walk" || state.anim === "run" || (!state.anim && p.speed01 > 0.05));

        if (p.stepping) {
            if (typeof state.gaitPhase === "number" && Number.isFinite(state.gaitPhase)) {
                // Unwrap shortest path on the unit circle so legs don't skip.
                let target = state.gaitPhase % 1;
                if (target < 0) target += 1;
                let d = target - p.gaitPhase;
                if (d > 0.5) d -= 1;
                if (d < -0.5) d += 1;
                p.gaitPhase = (p.gaitPhase + d * Math.min(1, 14 * safeDt) + 1) % 1;
            } else {
                // Distance-driven like local controller (stride ~0.7–1.0 m).
                const stride = 0.85 * (0.72 + 0.28 * Math.min(1, p.speed / 5.4));
                p.gaitPhase = (p.gaitPhase + dist / Math.max(0.35, stride)) % 1;
            }
        } else {
            // Softly settle gait so surf/idle doesn't freeze mid-stride forever.
            p.gaitPhase = expDamp(p.gaitPhase, 0, 6, safeDt);
        }

        this._lastX = state.x;
        this._lastY = state.y;
        this._lastZ = state.z;
        // Remote eye for spell aim / trauma-less pose (not the observer camera).
        this.rig.camera.position.set(state.x, state.y + 1.5, state.z);
        // Figure first so SnowContact can read plant positions on the same frame.
        this.visual.update(dt);
        if (this.contact) this.contact.update(safeDt);
        // Wake uses the *local* camera for fog/shadows (same as main loop).
        if (this.wake) {
            const cam = this._observerCam.lengthSquared() > 0
                ? this._observerCam
                : this.rig.camera.position;
            this.wake.update(safeDt, cam);
        }
        this.spells.update(this.puppet.position, dt);
    }

    /**
     * Aim + cast pose when a spell event arrives (full system or proxy).
     * @param {import('@snowflow/shared').SpellEvent} event
     */
    noteSpell(event) {
        this.rig.forward.set(event.aimX, event.aimY, event.aimZ);
        this.puppet.castAimX = event.aimX;
        this.puppet.castAimY = event.aimY;
        this.puppet.castAimZ = event.aimZ;
        this.puppet.cast = 1;
        // Hold cast arms until move samples catch up (or spell ends).
        this._castHold = event.key === 2 && event.phase !== "release" ? 2.5 : 0.65;
        if (event.phase === "release") this._castHold = 0.35;
    }

    /**
     * Proxy fallback when full SpellSystem is at cap or throws.
     * @param {import('@snowflow/shared').SpellEvent} event
     */
    playSpell(event) {
        this.noteSpell(event);
        this.spells.trigger(event, this.puppet.position);
    }

    /** @param {import('@babylonjs/core/Maths/math.vector').Vector3} cameraPos */
    sync(cameraPos) {
        if (cameraPos) this._observerCam.copyFrom(cameraPos);
        this.visual.sync(cameraPos);
    }

    dispose() {
        if (this.wake) {
            try {
                this.wake.setEnabled(false);
                this.wake.mesh?.dispose?.();
                this.wake.material?.dispose?.();
                this.wake.dataTex?.dispose?.();
            } catch {
                /* ignore */
            }
            this.wake = null;
        }
        this.contact = null;
        this.spells.dispose();
        this.visual.dispose();
    }
}
