/**
 * Remote spell visual proxies (Phase 1).
 * Sized to match the actual game-scale spell effects.
 * renderingGroupId=1 matches characters so terrain cannot occlude them.
 */

import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Vector3 } from "@babylonjs/core/Maths/math";

// Water/ice palette matching the game's spell aesthetic
const C_WATER   = new Color3(0.50, 0.82, 1.00);
const C_ICE     = new Color3(0.78, 0.94, 1.00);
const C_CRYSTAL = new Color3(0.45, 0.78, 1.00);
const C_FOAM    = new Color3(0.90, 0.97, 1.00);
const C_VORTEX  = new Color3(0.60, 0.88, 1.00);

function makeMat(scene, base, emStr) {
    const m = new StandardMaterial("rsf_m_" + Math.random().toString(36).slice(2), scene);
    m.diffuseColor  = base.scale(0.5);
    m.emissiveColor = base.scale(emStr);
    m.specularColor = Color3.Black();
    m.backFaceCulling = false;
    return m;
}

export class RemoteSpellFx {
    /** @param {import('@babylonjs/core/scene').Scene} scene */
    constructor(scene) {
        this.scene = scene;
        this.active   = false;
        this.key      = 0;
        this.life     = 0;
        this.duration = 0;
        this._origin  = new Vector3();
        this._target  = new Vector3();

        // -------- materials --------
        this._matSweep  = makeMat(scene, C_WATER,   0.65);
        this._matRibbon = makeMat(scene, C_FOAM,    0.80);
        this._matBloom  = makeMat(scene, C_WATER,   0.90);
        this._matCryst  = makeMat(scene, C_CRYSTAL, 0.85);
        this._matVortex = makeMat(scene, C_VORTEX,  0.90);

        // -------- Sweep (key1): 2 expanding ground rings --------
        this._sweepRings = [0, 1].map((i) => {
            const r = MeshBuilder.CreateTorus("rsf_sw_" + i,
                { diameter: 1.0 + i * 0.8, thickness: 0.12, tessellation: 48 }, scene);
            r.material = this._matSweep;
            r.renderingGroupId = 1;
            r.isPickable = false;
            r.isVisible  = false;
            return r;
        });

        // -------- Ribbon (key2): tall wavy beam --------
        this._ribbonBeam = MeshBuilder.CreateCylinder("rsf_rib",
            { height: 3.5, diameter: 0.22, tessellation: 14 }, scene);
        this._ribbonBeam.material = this._matRibbon;
        this._ribbonBeam.renderingGroupId = 1;
        this._ribbonBeam.isPickable = false;
        this._ribbonBeam.isVisible  = false;

        // -------- Bloom (key3): vertical column + base disc --------
        this._bloomPillar = MeshBuilder.CreateCylinder("rsf_bl_pillar",
            { height: 5.5, diameter: 0.55, tessellation: 16 }, scene);
        this._bloomDisc = MeshBuilder.CreateDisc("rsf_bl_disc",
            { radius: 2.5, tessellation: 48 }, scene);
        for (const m of [this._bloomPillar, this._bloomDisc]) {
            m.material = this._matBloom;
            m.renderingGroupId = 1;
            m.isPickable = false;
            m.isVisible  = false;
        }

        // -------- Crystallize (key4): 6 tall angular spikes --------
        this._crystSpikes = Array.from({ length: 6 }, (_, i) => {
            // vary size to look more natural
            const h = 2.8 + (i % 3) * 0.9;
            const w = 0.25 + (i % 2) * 0.12;
            const s = MeshBuilder.CreateBox("rsf_cr_" + i,
                { width: w, height: h, depth: w }, scene);
            s.material = this._matCryst;
            s.renderingGroupId = 1;
            s.isPickable = false;
            s.isVisible  = false;
            return s;
        });

        // -------- Vortex (key5): 3 stacked spinning rings --------
        this._vortexRings = [0, 1, 2].map((i) => {
            const r = MeshBuilder.CreateTorus("rsf_vx_" + i,
                { diameter: 2.4 + i * 1.8, thickness: 0.10, tessellation: 52 }, scene);
            r.material = this._matVortex;
            r.renderingGroupId = 1;
            r.isPickable = false;
            r.isVisible  = false;
            return r;
        });
    }

    /** @param {import('@snowflow/shared').SpellEvent} event */
    trigger(event) {
        this._hideAll();
        this.key  = event.key;
        this.life = 0;

        const durations = [2.4, 3.0, 5.2, 2.8, 4.65];
        this.duration = (event.phase === "release") ? 1.2
            : durations[(event.key ?? 1) - 1];

        this._target.set(
            Number.isFinite(event.targetX) ? event.targetX : this._origin.x + event.aimX * 4,
            Number.isFinite(event.targetY) ? event.targetY : this._origin.y,
            Number.isFinite(event.targetZ) ? event.targetZ : this._origin.z + event.aimZ * 4,
        );
        this.active = true;
    }

    /**
     * @param {Vector3} origin remote character world position
     * @param {number}  dt
     */
    update(origin, dt) {
        this._origin.copyFrom(origin);
        if (!this.active) return;

        this.life += dt;
        if (this.life >= this.duration) {
            this.active = false;
            this._hideAll();
            return;
        }

        const t01 = Math.min(1, this.life / Math.max(this.duration, 0.01));

        switch (this.key) {
            case 1: this._doSweep(t01);   break;
            case 2: this._doRibbon();     break;
            case 3: this._doBloom(t01);   break;
            case 4: this._doCrystal(t01); break;
            case 5: this._doVortex(t01);  break;
        }
    }

    _doSweep(t) {
        // crescent travels outward — match Sweep's ~10 m reach over 2.4 s
        const reach = 1.0 + t * 10.5;
        for (let i = 0; i < 2; i++) {
            const r = this._sweepRings[i];
            r.position.set(this._origin.x, this._origin.y + 0.06, this._origin.z);
            r.scaling.setAll(reach / (1.0 + i * 0.8));
            r.rotation.x = Math.PI * 0.5;
            r.isVisible = t < 0.96;
        }
        this._showOnly("sweep");
    }

    _doRibbon() {
        const b = this._ribbonBeam;
        b.position.set(
            this._origin.x + Math.sin(this.life * 3.5) * 0.55,
            this._origin.y + 1.75,
            this._origin.z + Math.cos(this.life * 2.8) * 0.55,
        );
        b.rotation.x = Math.sin(this.life * 2.2) * 0.35;
        b.rotation.z = Math.cos(this.life * 1.8) * 0.25;
        b.scaling.set(
            0.7 + Math.sin(this.life * 11) * 0.25,
            1.0 + Math.sin(this.life * 5) * 0.18,
            0.7 + Math.cos(this.life * 9) * 0.25,
        );
        b.isVisible = true;
        this._showOnly("ribbon");
    }

    _doBloom(t) {
        const rise  = Math.sin(Math.min(1, t / 0.32) * Math.PI);
        const fade  = t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1;

        this._bloomPillar.position.set(
            this._target.x,
            this._target.y + 0.5 + rise * 3.5,
            this._target.z,
        );
        this._bloomPillar.scaling.setAll(rise * fade * 1.4);
        this._bloomPillar.isVisible = rise > 0.03;

        this._bloomDisc.position.set(this._target.x, this._target.y + 0.05, this._target.z);
        this._bloomDisc.scaling.setAll(0.3 + t * 5.8);
        this._bloomDisc.rotation.x = -Math.PI * 0.5;
        this._bloomDisc.isVisible  = t > 0.06;
        this._showOnly("bloom");
    }

    _doCrystal(t) {
        // spikes grow over first 0.7 s, then stand and fade
        const grow = Math.min(1, t / 0.7);
        const fade = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
        const n    = this._crystSpikes.length;
        const cx   = this._target.x;
        const cy   = this._target.y;
        const cz   = this._target.z;

        for (let i = 0; i < n; i++) {
            const s     = this._crystSpikes[i];
            const angle = (i / n) * Math.PI * 2;
            const dist  = 1.2 + (i % 2) * 0.7;
            const tilt  = (i % 2 === 0 ? 0.28 : -0.22) * grow;
            s.position.set(
                cx + Math.cos(angle) * dist * grow,
                cy + (s._spH ?? 1.4) * grow * 0.5,
                cz + Math.sin(angle) * dist * grow,
            );
            // store half-height for reuse
            if (!s._spH) {
                const h = parseFloat(s.getBoundingInfo().boundingBox.extendSize.y * 2);
                s._spH = h > 0 ? h * 0.5 : 1.4;
            }
            s.scaling.y  = grow * fade;
            s.scaling.x  = grow * fade;
            s.scaling.z  = grow * fade;
            s.rotation.x = tilt;
            s.rotation.z = tilt * 0.7;
            s.isVisible  = grow > 0.05 && fade > 0.05;
        }
        this._showOnly("crystal");
    }

    _doVortex(t) {
        // Stack rings at different heights so the column reads as a vortex,
        // not a flat disc on the ground. Matches the helix column visual.
        const heights = [0.3, 1.55, 2.9];
        const sizes   = [1.0, 0.85, 0.65]; // wider at base, narrower at top

        for (let i = 0; i < this._vortexRings.length; i++) {
            const r   = this._vortexRings[i];
            const lag = i * 0.14;
            const tl  = Math.max(0, t - lag);
            const env = Math.sin(Math.min(1, tl / 0.20) * Math.PI) *
                        (t < 0.82 ? 1 : 1 - (t - 0.82) / 0.18);
            const spd = 4.5 + i * 1.8;  // faster = more tornado-like

            r.position.set(
                this._origin.x,
                this._origin.y + heights[i],
                this._origin.z,
            );
            r.scaling.setAll(env * sizes[i]);
            r.rotation.y = this.life * spd;
            r.isVisible  = env > 0.03;
        }
        this._showOnly("vortex");
    }

    /** Hide every mesh except the active group. */
    _showOnly(group) {
        if (group !== "sweep")   for (const r of this._sweepRings)  r.isVisible = false;
        if (group !== "ribbon")  this._ribbonBeam.isVisible = false;
        if (group !== "bloom") { this._bloomPillar.isVisible = false; this._bloomDisc.isVisible = false; }
        if (group !== "crystal") for (const s of this._crystSpikes)  s.isVisible = false;
        if (group !== "vortex")  for (const r of this._vortexRings)  r.isVisible = false;
    }

    _hideAll() {
        for (const r of this._sweepRings)  r.isVisible = false;
        this._ribbonBeam.isVisible = false;
        this._bloomPillar.isVisible = false;
        this._bloomDisc.isVisible   = false;
        for (const s of this._crystSpikes) s.isVisible = false;
        for (const r of this._vortexRings) r.isVisible = false;
    }

    dispose() {
        for (const r of this._sweepRings)  r.dispose();
        this._ribbonBeam.dispose();
        this._bloomPillar.dispose();
        this._bloomDisc.dispose();
        for (const s of this._crystSpikes) s.dispose();
        for (const r of this._vortexRings) r.dispose();
        for (const m of [
            this._matSweep, this._matRibbon, this._matBloom,
            this._matCryst, this._matVortex,
        ]) m.dispose();
    }
}
