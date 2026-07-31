/**
 * Remote spell visual proxies (Phase 1).
 *
 * Key → shape must match the *silhouette* of the full local spell, not a random
 * marker. Full systems live in packages/client/src/spells/*; this file only
 * approximates them for peers (no water body / crystal field / deform).
 *
 *   1 Sweep       — crescent wall of slush sheets (not torus rings)
 *   2 Ribbon      — held flowing ribbon strip along aim
 *   3 Bloom       — fat eruption column + crater disc at target
 *   4 Crystallize — short ice prisms / flat facets in a spiral (not tall spikes)
 *   5 Vortex      — stacked spinning rings + center column at caster
 */

import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Vector3 } from "@babylonjs/core/Maths/math";

const C_WATER = new Color3(0.50, 0.82, 1.00);
const C_ICE = new Color3(0.82, 0.94, 1.00);
const C_CRYSTAL = new Color3(0.55, 0.82, 1.00);
const C_FOAM = new Color3(0.90, 0.97, 1.00);
const C_VORTEX = new Color3(0.60, 0.88, 1.00);

/** Durations aligned with local spell clocks (see spellSystem.hudSlots). */
const DURATION = {
    1: 2.4,
    /** Hold can last indefinitely — safety only; release ends it early. */
    2: 120,
    3: 5.15, // LIFE 1.75 + FALLOUT 3.4
    4: 2.45, // plant 0.85 + tail ~1.6
    5: 4.65, // RAMP+HOLD+FADE
    release: 1.35,
};

const GOLDEN = 2.39996323;

function makeMat(scene, base, emStr, alpha = 0.88) {
    const m = new StandardMaterial("rsf_m_" + Math.random().toString(36).slice(2, 8), scene);
    m.diffuseColor = base.scale(0.28);
    m.emissiveColor = base.scale(emStr);
    m.specularColor = Color3.Black();
    m.disableLighting = true;
    m.backFaceCulling = false;
    m.alpha = alpha;
    m.transparencyMode = 2;
    return m;
}

function tagMesh(mesh) {
    mesh.renderingGroupId = 1;
    mesh.isPickable = false;
    mesh.isVisible = false;
    mesh.alwaysSelectAsActiveMesh = true;
    return mesh;
}

export class RemoteSpellFx {
    /** @param {import('@babylonjs/core/scene').Scene} scene */
    constructor(scene) {
        this.scene = scene;
        this.active = false;
        this.key = 0;
        this.life = 0;
        this.duration = 0;
        /** Ribbon hold stays up until phase=release (or safety timeout). */
        this._holding = false;
        this._origin = new Vector3();
        this._target = new Vector3();
        this._aim = new Vector3(0, 0, 1);

        this._matSweep = makeMat(scene, C_WATER, 1.2, 0.82);
        this._matRibbon = makeMat(scene, C_FOAM, 1.3, 0.85);
        this._matBloom = makeMat(scene, C_WATER, 1.4, 0.9);
        this._matCryst = makeMat(scene, C_CRYSTAL, 1.25, 0.92);
        this._matIceSheet = makeMat(scene, C_ICE, 1.15, 0.78);
        this._matVortex = makeMat(scene, C_VORTEX, 1.3, 0.88);

        // ---- 1 Sweep: arc of thin vertical sheets (crescent wall) ----
        // Full Sweep is PROFILE_SHEET water on a curved spine — proxy = 7 flat panels.
        this._sweepPanels = Array.from({ length: 7 }, (_, i) => {
            const p = MeshBuilder.CreateBox(
                "rsf_sw_p_" + i,
                { width: 1.35, height: 2.0, depth: 0.12 },
                scene,
            );
            p.material = this._matSweep;
            return tagMesh(p);
        });

        // ---- 2 Ribbon: long thin strip (flowing band, not a fat beam) ----
        this._ribbonStrip = tagMesh(
            MeshBuilder.CreateBox(
                "rsf_rib",
                { width: 0.55, height: 0.14, depth: 3.8 },
                scene,
            ),
        );
        this._ribbonStrip.material = this._matRibbon;

        // ---- 3 Bloom: fat column (GIRTH~0.66, HEIGHT~5.6) + crater disc ----
        this._bloomPillar = tagMesh(
            MeshBuilder.CreateCylinder(
                "rsf_bl_pillar",
                { height: 5.6, diameter: 1.35, tessellation: 18 },
                scene,
            ),
        );
        this._bloomPillar.material = this._matBloom;
        this._bloomDisc = tagMesh(
            MeshBuilder.CreateDisc("rsf_bl_disc", { radius: 2.4, tessellation: 40 }, scene),
        );
        this._bloomDisc.material = this._matBloom;

        // ---- 4 Crystallize: short prisms + a few flat ice facets in spiral ----
        // Full Crystallize plants hexagonal prisms (chest-high center, shorter edge).
        // Old proxy used 3m+ spike boxes — wrong silhouette vs flat ice sheets/prisms.
        this._crystPrisms = Array.from({ length: 12 }, (_, i) => {
            const n01 = i / 11;
            const h = 1.75 * (1 - n01 * 0.55) * (0.75 + (i % 3) * 0.12);
            const r = 0.18 * (0.85 + (i % 2) * 0.25);
            // 6-sided prism reads closer to crystal shader than a box spike.
            const s = MeshBuilder.CreateCylinder(
                "rsf_cr_p_" + i,
                { height: h, diameter: r * 2, tessellation: 6 },
                scene,
            );
            s.material = this._matCryst;
            s._crH = h;
            s._crR = r;
            s._crN = n01;
            return tagMesh(s);
        });
        // Flat ice plates mixed in — matches the "sheet of ice" reading of the full spell.
        this._crystSheets = Array.from({ length: 5 }, (_, i) => {
            const s = MeshBuilder.CreateBox(
                "rsf_cr_s_" + i,
                { width: 0.95 + (i % 2) * 0.35, height: 0.08, depth: 1.15 + (i % 3) * 0.2 },
                scene,
            );
            s.material = this._matIceSheet;
            return tagMesh(s);
        });

        // ---- 5 Vortex: rings + thin center column ----
        this._vortexRings = [0, 1, 2].map((i) => {
            const r = MeshBuilder.CreateTorus(
                "rsf_vx_" + i,
                { diameter: 2.6 + i * 1.7, thickness: 0.12, tessellation: 48 },
                scene,
            );
            r.material = this._matVortex;
            return tagMesh(r);
        });
        this._vortexCore = tagMesh(
            MeshBuilder.CreateCylinder(
                "rsf_vx_core",
                { height: 3.4, diameter: 0.45, tessellation: 12 },
                scene,
            ),
        );
        this._vortexCore.material = this._matVortex;
    }

    /**
     * @param {import('@snowflow/shared').SpellEvent} event
     * @param {Vector3 | { x:number, y:number, z:number }} [origin]
     */
    trigger(event, origin) {
        const isRibbon = event.key === 2;
        const isRelease = event.phase === "release";

        // Ribbon is a hold: start keeps a long-lived strip; release ends it.
        // Do not full-reset mid-hold (would flicker off every re-trigger).
        if (!(isRibbon && this.active && this.key === 2 && !isRelease && this._holding)) {
            this._hideAll();
            this.life = 0;
        }

        this.key = event.key;
        this._holding = isRibbon && !isRelease;
        this.duration = isRelease
            ? DURATION.release
            : isRibbon
                ? DURATION[2]
                : (DURATION[event.key] ?? 2.5);

        if (origin) {
            this._origin.set(Number(origin.x) || 0, Number(origin.y) || 0, Number(origin.z) || 0);
        }

        const ax = Number.isFinite(event.aimX) ? event.aimX : 0;
        const ay = Number.isFinite(event.aimY) ? event.aimY : 0;
        const az = Number.isFinite(event.aimZ) ? event.aimZ : 1;
        const al = Math.hypot(ax, ay, az) || 1;
        this._aim.set(ax / al, ay / al, az / al);

        const hasTarget =
            Number.isFinite(event.targetX) &&
            Number.isFinite(event.targetY) &&
            Number.isFinite(event.targetZ);

        if (hasTarget) {
            this._target.set(event.targetX, event.targetY, event.targetZ);
        } else {
            this._target.set(
                this._origin.x + this._aim.x * 5,
                this._origin.y,
                this._origin.z + this._aim.z * 5,
            );
        }

        // Release of ribbon: short throw tail then hide.
        if (isRibbon && isRelease) {
            this._holding = false;
            this.life = 0;
            this.duration = DURATION.release;
        }

        this.active = true;
        this._pose(0);
    }

    /**
     * @param {Vector3} origin
     * @param {number} dt
     */
    update(origin, dt) {
        if (origin) this._origin.copyFrom(origin);
        if (!this.active) return;

        this.life += dt;
        // Held ribbon never auto-expires on the short timer — only release / safety cap.
        if (!this._holding && this.life >= this.duration) {
            this.active = false;
            this._holding = false;
            this._hideAll();
            return;
        }
        if (this._holding && this.life >= this.duration) {
            // Safety: if peer never sent release, drop after long cap.
            this.active = false;
            this._holding = false;
            this._hideAll();
            return;
        }
        const t01 = this._holding
            ? 0.5
            : Math.min(1, this.life / Math.max(this.duration, 0.01));
        this._pose(t01);
    }

    /** @param {number} t01 */
    _pose(t01) {
        switch (this.key) {
            case 1:
                this._doSweep(t01);
                break;
            case 2:
                this._doRibbon();
                break;
            case 3:
                this._doBloom(t01);
                break;
            case 4:
                this._doCrystal(t01);
                break;
            case 5:
                this._doVortex(t01);
                break;
            default:
                this._hideAll();
        }
    }

    /** Crescent of sheet panels — matches Sweep PROFILE_SHEET wall, not rings. */
    _doSweep(t) {
        const fx = this._aim.x;
        const fz = this._aim.z;
        const fl = Math.hypot(fx, fz) || 1;
        const dx = fx / fl;
        const dz = fz / fl;
        const rx = -dz;
        const rz = dx;

        // Full Sweep: born ~1.1 m ahead, reach grows ~1.4 → ~10 m, fixed CURVE.
        const reach = 1.4 + t * 9.0;
        const arc = 0.52 + t * (0.96 - 0.52);
        const n = this._sweepPanels.length;
        const peak = 2.15 * (1 - Math.pow(Math.max(0, t - 0.65) / 0.35, 1.2));
        const env = t < 0.08 ? t / 0.08 : t > 0.85 ? 1 - (t - 0.85) / 0.15 : 1;

        for (let i = 0; i < n; i++) {
            const p = this._sweepPanels[i];
            const u = n === 1 ? 0 : i / (n - 1);
            const ang = -arc + u * arc * 2;
            // Arc centered ahead of caster along aim (same idea as sweep spine).
            const cx = this._origin.x + dx * reach;
            const cz = this._origin.z + dz * reach;
            const ox = Math.sin(ang) * reach * 0.55;
            const oz = (1 - Math.cos(ang)) * reach * 0.12;
            const wx = cx + rx * ox - dx * oz;
            const wz = cz + rz * ox - dz * oz;
            const h = peak * (0.55 + 0.45 * Math.cos(ang * 0.9)) * Math.max(0.05, env);

            p.position.set(wx, this._origin.y + h * 0.5 + 0.05, wz);
            p.scaling.set(1.05, Math.max(0.08, h / 2.0), 1);
            // Face outward along the crescent normal.
            const yaw = Math.atan2(dx, dz) + ang;
            p.rotation.set(0, yaw, 0);
            p.isVisible = env > 0.04 && h > 0.12;
        }
        this._showOnly("sweep");
    }

    /** Flowing ribbon strip in front of caster (Ribbon hold). */
    _doRibbon() {
        const s = this._ribbonStrip;
        const ox = this._origin.x + this._aim.x * 1.4;
        const oy = this._origin.y + 1.35 + Math.sin(this.life * 4.2) * 0.2;
        const oz = this._origin.z + this._aim.z * 1.4;
        s.position.set(
            ox + Math.sin(this.life * 3.1) * 0.35,
            oy,
            oz + Math.cos(this.life * 2.6) * 0.35,
        );
        const yaw = Math.atan2(this._aim.x, this._aim.z);
        s.rotation.set(
            Math.sin(this.life * 2.4) * 0.35,
            yaw,
            Math.cos(this.life * 1.9) * 0.25,
        );
        s.scaling.set(
            0.9 + Math.sin(this.life * 9) * 0.15,
            1,
            1.0 + Math.sin(this.life * 5) * 0.12,
        );
        s.isVisible = true;
        this._showOnly("ribbon");
    }

    /** Fat water column + crater — matches Bloom tube, not crystal spikes. */
    _doBloom(t) {
        // Local: rise ~0.34s of LIFE 1.75, then fallout. Map whole proxy life to that feel.
        const lifeLocal = t * 5.15;
        const rise = lifeLocal < 0.1 ? 0 : Math.min(1, (lifeLocal - 0.1) / 0.34);
        const hold = lifeLocal < 0.9 ? 1 : Math.max(0, 1 - (lifeLocal - 0.9) / 0.85);
        const col = rise * hold;
        const tx = this._target.x;
        const ty = this._target.y;
        const tz = this._target.z;

        // Waist mid / flare head — approximate with non-uniform scale.
        this._bloomPillar.position.set(tx, ty + 2.8 * col, tz);
        this._bloomPillar.scaling.set(
            0.85 + 0.25 * Math.sin(this.life * 3),
            Math.max(0.05, col),
            0.85 + 0.25 * Math.cos(this.life * 2.5),
        );
        this._bloomPillar.rotation.x = 0.08;
        this._bloomPillar.rotation.z = 0.06;
        this._bloomPillar.isVisible = col > 0.03;

        const discT = Math.min(1, lifeLocal / 0.5);
        this._bloomDisc.position.set(tx, ty + 0.06, tz);
        this._bloomDisc.scaling.setAll(0.4 + discT * 2.8);
        this._bloomDisc.rotation.x = -Math.PI * 0.5;
        this._bloomDisc.isVisible = lifeLocal > 0.08;
        this._showOnly("bloom");
    }

    /**
     * Ice prism cluster + flat sheets — matches Crystallize (spiral plant),
     * not the old tall spike boxes.
     */
    _doCrystal(t) {
        const plant = Math.min(1, t / 0.35); // first ~0.85s of full plant compressed a bit for proxy
        const fade = t > 0.82 ? 1 - (t - 0.82) / 0.18 : 1;
        const cx = this._target.x;
        const cy = this._target.y;
        const cz = this._target.z;
        const n = this._crystPrisms.length;
        const showN = Math.max(1, Math.ceil(plant * n));

        for (let i = 0; i < n; i++) {
            const s = this._crystPrisms[i];
            if (i >= showN) {
                s.isVisible = false;
                continue;
            }
            const n01 = s._crN ?? i / (n - 1);
            const ang = i * GOLDEN;
            const rad = 0.18 + Math.sqrt(n01) * 2.05;
            const h = (s._crH || 1.2) * plant * fade;
            const tilt = (0.1 + n01 * 0.35) * plant;

            s.position.set(
                cx + Math.cos(ang) * rad,
                cy + h * 0.5 - 0.02,
                cz + Math.sin(ang) * rad,
            );
            s.scaling.set(plant * fade, Math.max(0.05, plant * fade), plant * fade);
            s.rotation.x = Math.cos(ang) * tilt;
            s.rotation.z = Math.sin(ang) * tilt;
            s.rotation.y = ang;
            s.isVisible = h > 0.08 && fade > 0.05;
        }

        for (let i = 0; i < this._crystSheets.length; i++) {
            const s = this._crystSheets[i];
            const ang = i * 1.1 + 0.4;
            const rad = 0.6 + i * 0.45;
            const g = Math.min(1, Math.max(0, (plant * n - (i + 3)) / 3));
            s.position.set(
                cx + Math.cos(ang) * rad,
                cy + 0.06 + g * 0.15,
                cz + Math.sin(ang) * rad,
            );
            s.rotation.set(0.05 * (i % 2 ? 1 : -1), ang * 0.7, 0.08 * (i % 3 - 1));
            s.scaling.setAll(Math.max(0.05, g * fade));
            s.isVisible = g > 0.08 && fade > 0.05;
        }
        this._showOnly("crystal");
    }

    _doVortex(t) {
        const heights = [0.35, 1.55, 2.85];
        const sizes = [1.1, 0.9, 0.68];
        for (let i = 0; i < this._vortexRings.length; i++) {
            const r = this._vortexRings[i];
            const lag = i * 0.1;
            const tl = Math.max(0, t - lag);
            const env =
                Math.sin(Math.min(1, tl / 0.16) * Math.PI) *
                (t < 0.82 ? 1 : 1 - (t - 0.82) / 0.18);
            r.position.set(this._origin.x, this._origin.y + heights[i], this._origin.z);
            r.scaling.setAll(Math.max(0.05, env * sizes[i]));
            r.rotation.y = this.life * (4.5 + i * 1.8);
            r.isVisible = env > 0.03;
        }
        const core = Math.sin(Math.min(1, t / 0.2) * Math.PI) * (t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15);
        this._vortexCore.position.set(this._origin.x, this._origin.y + 1.7, this._origin.z);
        this._vortexCore.scaling.set(
            0.7 + Math.sin(this.life * 8) * 0.15,
            Math.max(0.05, core),
            0.7 + Math.cos(this.life * 7) * 0.15,
        );
        this._vortexCore.rotation.y = this.life * 6;
        this._vortexCore.isVisible = core > 0.04;
        this._showOnly("vortex");
    }

    _showOnly(group) {
        if (group !== "sweep") for (const p of this._sweepPanels) p.isVisible = false;
        if (group !== "ribbon") this._ribbonStrip.isVisible = false;
        if (group !== "bloom") {
            this._bloomPillar.isVisible = false;
            this._bloomDisc.isVisible = false;
        }
        if (group !== "crystal") {
            for (const s of this._crystPrisms) s.isVisible = false;
            for (const s of this._crystSheets) s.isVisible = false;
        }
        if (group !== "vortex") {
            for (const r of this._vortexRings) r.isVisible = false;
            this._vortexCore.isVisible = false;
        }
    }

    _hideAll() {
        for (const p of this._sweepPanels) p.isVisible = false;
        this._ribbonStrip.isVisible = false;
        this._bloomPillar.isVisible = false;
        this._bloomDisc.isVisible = false;
        for (const s of this._crystPrisms) s.isVisible = false;
        for (const s of this._crystSheets) s.isVisible = false;
        for (const r of this._vortexRings) r.isVisible = false;
        this._vortexCore.isVisible = false;
    }

    dispose() {
        for (const p of this._sweepPanels) p.dispose();
        this._ribbonStrip.dispose();
        this._bloomPillar.dispose();
        this._bloomDisc.dispose();
        for (const s of this._crystPrisms) s.dispose();
        for (const s of this._crystSheets) s.dispose();
        for (const r of this._vortexRings) r.dispose();
        this._vortexCore.dispose();
        for (const m of [
            this._matSweep,
            this._matRibbon,
            this._matBloom,
            this._matCryst,
            this._matIceSheet,
            this._matVortex,
        ]) {
            m.dispose();
        }
    }
}
