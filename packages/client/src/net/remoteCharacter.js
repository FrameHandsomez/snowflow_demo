/**
 * Remote character visual state.
 * It mirrors network snapshots into the existing procedural Character renderer,
 * but never reads local input or runs collision.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Character } from "../character/character.js";
import { RemoteSpellFx } from "./remoteSpellFx.js";

export class RemoteCharacter {
    /**
     * @param {object} opts
     * @param {import('@babylonjs/core/scene').Scene} opts.scene
     * @param {import('../terrain/terrain.js').Terrain} opts.characterTerrain
     * @param {import('../render/sky.js').Sky} opts.sky
     * @param {import('../render/shadows.js').ShadowSystem} opts.shadows
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
            stepping: true,
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
        // Remote casts use cheap markers; the full terrain spell system belongs
        // to the local player only.
        this.spells = new RemoteSpellFx(opts.scene);
        this._lastX = 0;
        this._lastY = 0;
        this._lastZ = 0;
        this._initialized = false;
        this.ready = false;
        this.visual.setVisible(false);
    }

    /**
     * Compile the remote character materials after the main loading screen.
     * Remote players are created when a peer joins, so they miss boot warm-up.
     */
    async prepare() {
        await this.visual.warmUp();
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
        p.speed01 = state.speed01;
        p.speed = state.speed01 * 8;
        p.surf = state.surfing ? 1 : 0;
        p.surfActive = !!state.surfing;
        p.lean = state.lean;
        p.grounded = !!state.grounded;
        p.air = state.grounded ? 0 : 1;
        p.stepping = state.anim === "walk" || state.anim === "run" || state.anim === "surf";
        if (p.stepping) p.gaitPhase = (p.gaitPhase + dt * p.speed * 0.42) % 1;

        this._lastX = state.x;
        this._lastY = state.y;
        this._lastZ = state.z;
        this.visual.update(dt);

        this.rig.camera.position.set(state.x, state.y + 1.5, state.z);
        this.spells.update(this.puppet.position, dt);
    }

    /** @param {import('@snowflow/shared').SpellEvent} event */
    playSpell(event) {
        this.rig.forward.set(event.aimX, event.aimY, event.aimZ);
        this.puppet.castAimX = event.aimX;
        this.puppet.castAimY = event.aimY;
        this.puppet.castAimZ = event.aimZ;
        this.spells.trigger(event);
    }

    /** @param {import('@babylonjs/core/Maths/math.vector').Vector3} cameraPos */
    sync(cameraPos) {
        this.visual.sync(cameraPos);
    }

    dispose() {
        this.spells.dispose();
        this.visual.dispose();
    }
}
