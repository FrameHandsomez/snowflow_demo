/**
 * The figure — skeleton, bind pose, and the procedural locomotion that poses it.
 *
 * There is no rig file and no animation data. Everything here is solved from the
 * motion state the controller already produces. The one thing that buys has to
 * be paid for in exchange: **feet plant rather than slide**.
 *
 * Planting is not approximated. When a foot enters stance its world position is
 * recorded and then held absolutely fixed while the body travels over it; the
 * leg is solved by two-bone IK to reach that fixed point. A foot in this rig
 * cannot slide, because during stance nothing in the code is capable of moving
 * it. The gait phase itself is driven by distance travelled, not by a clock, so
 * the stride length and the ground speed are the same number by construction.
 *
 * Bone convention: a bone's local +Y runs from its own joint toward its child,
 * so a hanging arm has +Y pointing at the floor. Geometry is authored in
 * bind-pose world space and skinned by `world * inverseBind`.
 *
 * Allocation: none per frame. Everything lives in flat arrays sized at
 * construction.
 */

import { setFrameFromDir, invertRigid, mul, xformPoint } from "../core/mat4.js";

// --------------------------------------------------------------- bone indices
export const B_ROOT = 0;
export const B_SPINE = 1;
export const B_CHEST = 2;
export const B_NECK = 3;
export const B_HEAD = 4;
export const B_HOOD = 5;
export const B_UPPER_L = 6;
export const B_FORE_L = 7;
export const B_HAND_L = 8;
export const B_UPPER_R = 9;
export const B_FORE_R = 10;
export const B_HAND_R = 11;
export const B_THIGH_L = 12;
export const B_SHIN_L = 13;
export const B_FOOT_L = 14;
export const B_THIGH_R = 15;
export const B_SHIN_R = 16;
export const B_FOOT_R = 17;
export const BONE_COUNT = 18;

/**
 * Bind pose, nine floats per bone: joint position, bone direction, front
 * reference. A 1.79 m figure with the pelvis at 0.95 — deliberately a little
 * long in the leg and narrow in the shoulder, because the silhouette is read at
 * fifteen metres through a robe and slightly heroic proportions survive that
 * better than accurate ones.
 */
const BIND = new Float32Array([
    /* ROOT    */ 0, 0.95, 0, 0, 1, 0, 0, 0, 1,
    /* SPINE   */ 0, 1.06, 0, 0, 1, 0, 0, 0, 1,
    /* CHEST   */ 0, 1.26, 0, 0, 1, 0, 0, 0, 1,
    /* NECK    */ 0, 1.46, 0, 0, 1, 0, 0, 0, 1,
    /* HEAD    */ 0, 1.55, 0, 0, 1, 0, 0, 0, 1,
    /* HOOD    */ 0, 1.55, 0, 0, 1, 0, 0, 0, 1,

    /* UPPER_L */ -0.185, 1.400, 0.000, -0.16, -0.987, 0, 0, 0, 1,
    /* FORE_L  */ -0.230, 1.123, 0.000, -0.05, -0.997, 0.06, 0, 0, 1,
    /* HAND_L  */ -0.243, 0.866, 0.016, -0.02, -0.992, 0.12, 0, 0, 1,
    /* UPPER_R */ 0.185, 1.400, 0.000, 0.16, -0.987, 0, 0, 0, 1,
    /* FORE_R  */ 0.230, 1.123, 0.000, 0.05, -0.997, 0.06, 0, 0, 1,
    /* HAND_R  */ 0.243, 0.866, 0.016, 0.02, -0.992, 0.12, 0, 0, 1,

    /* THIGH_L */ -0.100, 0.900, 0, 0, -1, 0, 0, 0, 1,
    /* SHIN_L  */ -0.100, 0.460, 0, 0, -1, 0, 0, 0, 1,
    /* FOOT_L  */ -0.100, 0.090, 0, 0, 0, 1, 0, 1, 0,
    /* THIGH_R */ 0.100, 0.900, 0, 0, -1, 0, 0, 0, 1,
    /* SHIN_R  */ 0.100, 0.460, 0, 0, -1, 0, 0, 0, 1,
    /* FOOT_R  */ 0.100, 0.090, 0, 0, 0, 1, 0, 1, 0,
]);

/** Segment lengths implied by the bind table, metres. */
const THIGH_LEN = 0.44;
const SHIN_LEN = 0.37;
const UPPER_LEN = 0.28;
const FORE_LEN = 0.26;

/** Pelvis height above the feet in the bind pose. */
const HIP_HEIGHT = 0.95;

// ------------------------------------------------------- module-scope scratch
const _axes = new Float32Array(9);   // X, Y, Z of a composed basis
const _p = new Float32Array(3);
const _knee = new Float32Array(3);
const _hip = new Float32Array(3);
const _sh = new Float32Array(3);

/**
 * Compose an orthonormal basis from yaw, then pitch about its own right axis,
 * then roll about its own forward axis. Writes X, Y, Z into `_axes`.
 *
 * Positive pitch leans forward, positive roll tips the head to the character's
 * right — which is the sign the controller's `lean` already uses.
 */
function composeBasis(yaw, pitch, roll) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    let xx = cy, xy = 0, xz = -sy;
    let yx = 0, yy = 1, yz = 0;
    let zx = sy, zy = 0, zz = cy;

    if (pitch !== 0) {
        const c = Math.cos(pitch), s = Math.sin(pitch);
        const nyx = yx * c + zx * s, nyy = yy * c + zy * s, nyz = yz * c + zz * s;
        const nzx = zx * c - yx * s, nzy = zy * c - yy * s, nzz = zz * c - yz * s;
        yx = nyx; yy = nyy; yz = nyz; zx = nzx; zy = nzy; zz = nzz;
    }
    if (roll !== 0) {
        const c = Math.cos(roll), s = Math.sin(roll);
        const nxx = xx * c - yx * s, nxy = xy * c - yy * s, nxz = xz * c - yz * s;
        const nyx = yx * c + xx * s, nyy = yy * c + xy * s, nyz = yz * c + xz * s;
        xx = nxx; xy = nxy; xz = nxz; yx = nyx; yy = nyy; yz = nyz;
    }

    _axes[0] = xx; _axes[1] = xy; _axes[2] = xz;
    _axes[3] = yx; _axes[4] = yy; _axes[5] = yz;
    _axes[6] = zx; _axes[7] = zy; _axes[8] = zz;
}

/**
 * Two-bone IK. Given a root joint, an end target and a pole direction, writes
 * the middle joint's world position into `out`.
 *
 * The target is pulled inside reach rather than clamped at it: a fully extended
 * leg reads as a stiff peg, and the last centimetre of reach is where all the
 * knee-lock artefacts live.
 */
function solveTwoBone(rx, ry, rz, tx, ty, tz, px, py, pz, l1, l2, out) {
    let dx = tx - rx, dy = ty - ry, dz = tz - rz;
    let dist = Math.hypot(dx, dy, dz);
    const maxReach = (l1 + l2) * 0.995;
    if (dist < 1e-4) { dx = 0; dy = -1; dz = 0; dist = 1e-4; }
    if (dist > maxReach) dist = maxReach;
    const inv = 1 / Math.hypot(dx, dy, dz);
    dx *= inv; dy *= inv; dz *= inv;

    // Cosine rule: how far along the root→target axis the middle joint projects.
    const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));

    // Pole, orthogonalised against the axis — this is what decides which way the
    // knee or elbow bends, and it has to be re-derived every frame because the
    // axis swings through it during a stride.
    const d = px * dx + py * dy + pz * dz;
    let ox = px - dx * d, oy = py - dy * d, oz = pz - dz * d;
    let ol = Math.hypot(ox, oy, oz);
    if (ol < 1e-5) { ox = 0; oy = 0; oz = 1; ol = 1; }
    ox /= ol; oy /= ol; oz /= ol;

    out[0] = rx + dx * a + ox * h;
    out[1] = ry + dy * a + oy * h;
    out[2] = rz + dz * a + oz * h;
}

/** Framerate-independent exponential approach. */
function damp(cur, target, rate, dt) {
    return target + (cur - target) * Math.exp(-rate * dt);
}

function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
}

export class Figure {
    /**
     * @param {{heightAt(x:number,z:number):number, normalAt(x:number,z:number,out:any):any}} terrain
     */
    constructor(terrain) {
        this.terrain = terrain;

        /** World matrix per bone. */
        this.world = new Float32Array(BONE_COUNT * 16);
        /** Bind-pose world matrix per bone. */
        this.bind = new Float32Array(BONE_COUNT * 16);
        /** Inverse of the above. */
        this.invBind = new Float32Array(BONE_COUNT * 16);
        /** `world * invBind` — the matrix geometry is actually skinned by. */
        this.skin = new Float32Array(BONE_COUNT * 16);

        /** World joint positions, three floats per bone. Cloth collision reads these. */
        this.joint = new Float32Array(BONE_COUNT * 3);

        for (let b = 0; b < BONE_COUNT; b++) {
            const o = b * 9;
            setFrameFromDir(
                this.bind, b * 16,
                BIND[o], BIND[o + 1], BIND[o + 2],
                BIND[o + 3], BIND[o + 4], BIND[o + 5],
                BIND[o + 6], BIND[o + 7], BIND[o + 8]
            );
            invertRigid(this.invBind, b * 16, this.bind, b * 16);
        }

        // ------------------------------------------------------------- gait
        /** Where each foot is planted, world. Frozen for the whole stance phase. */
        this.plant = new Float32Array(6);
        /** Live foot position (equals `plant` during stance). */
        this.footPos = new Float32Array(6);
        /** Ground normal under each planted foot. */
        this.footNormal = new Float32Array([0, 1, 0, 0, 1, 0]);
        /** 1 while the foot carries weight, 0 mid-swing. Eased. */
        this.footWeight = new Float32Array([1, 1]);
        this._wasStance = [true, true];
        /** Set for one frame when a foot touches down. Drives spray and splats. */
        this.touchdown = [false, false];

        // ------------------------------------------------- smoothed pose state
        this.hipY = HIP_HEIGHT;
        this.pitch = 0;
        this.roll = 0;
        this.bob = 0;
        this.headYaw = 0;
        this.headPitch = 0;
        this.hoodYaw = 0;
        this.hoodPitch = 0;
        this.armPhase = 0;
        /** How far the figure has settled into the snow, metres. */
        this.sink = 0.04;
        /** Landing crouch recover, metres of extra hip drop. */
        this.landSquash = 0;
        /** Jump takeoff stretch, metres. */
        this.jumpStretch = 0;
        /** Smoothed flip tuck 0..1 for limbs (peaks mid-spin). */
        this.flipTuckSm = 0;
        /** Last frame airborne — used to snap feet off the plant on takeoff. */
        this._wasAirborne = false;
        /** Last frame flipping — snap into ball tuck the instant spin starts. */
        this._wasFlipping = false;

        this._t = 0;
        this._prevGait = 0;
    }

    /**
     * Pose the skeleton for this frame.
     * @param {number} dt
     * @param {import("./controller.js").CharacterController} ch
     */
    update(dt, ch) {
        const h = Math.min(dt, 1 / 30);
        this._t += h;

        const surf = ch.surf;
        const air = ch.air || 0;
        const flipAngle = ch.flipAngle || 0;
        const flipTuck = ch.flipTuck || 0;
        const flipping = !!ch.flipping || flipAngle > 0.05;
        const surfAir = ch.surfAir || 0;
        const olliePhase = ch.olliePhase || 0;
        const ollie = Math.max(surfAir, olliePhase > 0.01 ? 1 : 0) * (flipping ? 0 : 1);
        const speed = ch.speed;
        const run = Math.min(1, speed / 5.4);
        const grounded = ch.grounded !== false && air < 0.55;
        // Flip always reads as a ball tuck — layout (straight body) is what made
        // mid-air frames look like a floating corpse in the screenshots.
        this.flipTuckSm = flipping
            ? damp(this.flipTuckSm, Math.max(flipTuck, 0.55), 28, h)
            : damp(this.flipTuckSm, 0, 18, h);

        // -------------------------------------------------------- body attitude
        // Attitude first, then feet in that body frame — otherwise a flip leaves
        // ankles planted in the world while the torso spins (reads as a gag).
        const fwdAcc =
            ch.acceleration.x * Math.sin(ch.facing) + ch.acceleration.z * Math.cos(ch.facing);

        // Ollie: short board hop — nose pop then level then toes-down. Never layout.
        let olliePitch = 0;
        let ollieCrouch = 0;
        if (ollie > 0.05) {
            const p = olliePhase;
            if (p < 0.28) {
                const t = p / 0.28;
                olliePitch = -0.16 * t;          // small nose-up (not a dive)
                ollieCrouch = 0.12 * (1 - t);
            } else if (p < 0.72) {
                const t = (p - 0.28) / 0.44;
                olliePitch = -0.16 * (1 - t) + 0.04 * t;
                ollieCrouch = 0.04;
            } else {
                const t = (p - 0.72) / 0.28;
                olliePitch = 0.04 + 0.10 * t;
                ollieCrouch = 0.04 + 0.10 * t;
            }
            olliePitch *= clamp(surfAir, 0, 1);
            ollieCrouch *= clamp(surfAir, 0, 1);
        }

        // Kill surf lean in the air so an ollie stays board-upright, not belly-flat.
        const airPitch =
            air * (1 - this.flipTuckSm) * (1 - ollie * 0.9) * (ch.velY > 0.4 ? -0.04 : 0.08);
        const surfPitch =
            surf * (0.30 + 0.16 * ch.speed01) * (1 - ollie * 0.75) * (1 - air * 0.85);
        const pitchWant =
            0.10 * run * (1 - air)
            + 0.012 * clamp(fwdAcc, -9, 22) * (1 - air * 0.7)
            + surfPitch
            + airPitch
            + olliePitch;
        // Snappier pitch while flipping/ollie so attitude doesn't lag a half-turn.
        const pitchRate = flipping ? 18 : ollie > 0.2 ? 14 : 7;
        this.pitch = damp(this.pitch, pitchWant, pitchRate, h);
        // Flip spin is pure body rotation on top of a compact base pitch.
        const rootPitch = flipping
            ? this.pitch * 0.25 + flipAngle
            : this.pitch;

        // Ollie inherits carve lean; flip stays neutral so the spin axis is clean.
        const rollWant = flipping
            ? 0
            : ch.lean * (0.16 + 0.34 * surf) + ollie * ch.lean * 0.28;
        this.roll = damp(this.roll, rollWant, flipping ? 10 : 8, h);

        const bobWant =
            (1 - surf) * (1 - air) * (-0.028 * run * (0.5 - 0.5 * Math.cos(4 * Math.PI * ch.gaitPhase)));
        this.bob = damp(this.bob, bobWant, 18, h);

        if (ch.jumpPulse > 0.01) {
            const mul = ch.jumpKind === 2 ? 1.1 : ch.jumpKind === 3 ? 1.25 : 1;
            this.jumpStretch = Math.max(this.jumpStretch, 0.055 * ch.jumpPulse * mul);
        }
        if (ch.landPulse > 0.01) this.landSquash = Math.max(this.landSquash, 0.11 * ch.landPulse);
        this.jumpStretch = damp(this.jumpStretch, 0, 9, h);
        this.landSquash = damp(this.landSquash, 0, 7, h);

        const crouch =
            0.035 * run
            + surf * (0.13 + 0.05 * ch.speed01) * (1 - ollie * 0.5)
            + this.landSquash
            + air * 0.03 * (1 - ollie)
            // Deep ball during flip — hips pull toward knees.
            + this.flipTuckSm * 0.38
            + ollieCrouch;
        this.hipY = damp(
            this.hipY,
            HIP_HEIGHT - crouch + this.jumpStretch * (1 - air * 0.25),
            flipping ? 16 : 10,
            h
        );

        const sinkWant = grounded ? 0.045 + surf * 0.055 : 0;
        this.sink = damp(this.sink, sinkWant, grounded ? 4 : 10, h);

        // ------------------------------------------------------------- spine
        const gx = ch.position.x;
        const gz = ch.position.z;
        const rootY = ch.position.y - this.sink + this.hipY + this.bob;

        composeBasis(ch.facing, rootPitch, this.roll);
        const rX = _axes[0], rY = _axes[1], rZ = _axes[2];
        const uX = _axes[3], uY = _axes[4], uZ = _axes[5];
        const fX = _axes[6], fY = _axes[7], fZ = _axes[8];

        // Feet need the body frame of this pose — resolve after basis exists.
        this._updateFeet(h, ch, rX, rY, rZ, uX, uY, uZ, fX, fY, fZ, rootY);

        const twist =
            (1 - surf) * (1 - air) * (1 - this.flipTuckSm) * (1 - ollie) *
            0.13 * run * Math.sin(2 * Math.PI * ch.gaitPhase);
        composeBasis(ch.facing + twist, rootPitch, this.roll);
        this._setBone(B_ROOT, gx, rootY, gz, _axes[3], _axes[4], _axes[5], _axes[6], _axes[7], _axes[8]);

        const spineY = rootY + uY * 0.11;
        this._setBone(
            B_SPINE, gx + uX * 0.11, spineY, gz + uZ * 0.11,
            uX, uY, uZ, fX, fY, fZ
        );

        const chestTwist = -twist * 1.5;
        // Flip: chest locked to root (tucked). Ollie: a little more board lean.
        // Walk/surf: usual extra pitch on the chest.
        const chestPitch = flipping
            ? rootPitch + this.flipTuckSm * 0.18
            : this.pitch + 0.05 * run + surf * 0.10 + ollie * olliePitch * 0.35;
        composeBasis(ch.facing + chestTwist, chestPitch, this.roll * (flipping ? 0.4 : 1.15));
        const cUx = _axes[3], cUy = _axes[4], cUz = _axes[5];
        const cFx = _axes[6], cFy = _axes[7], cFz = _axes[8];
        const cRx = _axes[0], cRy = _axes[1], cRz = _axes[2];

        const chestX = gx + uX * 0.31, chestY = rootY + uY * 0.31, chestZ = gz + uZ * 0.31;
        this._setBone(B_CHEST, chestX, chestY, chestZ, cUx, cUy, cUz, cFx, cFy, cFz);

        const neckX = chestX + cUx * 0.20, neckY = chestY + cUy * 0.20, neckZ = chestZ + cUz * 0.20;
        this._setBone(B_NECK, neckX, neckY, neckZ, cUx, cUy, cUz, cFx, cFy, cFz);

        // ------------------------------------------------------------- head
        // Flip: chin tucked. Ollie: eyes toward landing. Else: stabilise vs chest.
        let headWant;
        if (flipping) headWant = this.flipTuckSm * 0.45;
        else if (ollie > 0.2) headWant = -chestPitch * 0.35 + (ch.velY < 0 ? 0.12 : -0.05);
        else headWant = -chestPitch * 0.62 + surf * 0.10;
        this.headPitch = damp(this.headPitch, headWant, flipping ? 16 : 9, h);
        this.headYaw = damp(this.headYaw, flipping ? 0 : ch.lean * -0.22, 6, h);
        composeBasis(
            ch.facing + chestTwist + this.headYaw,
            flipping ? rootPitch + this.headPitch : chestPitch + this.headPitch,
            this.roll * 0.5
        );
        const headX = neckX + cUx * 0.09, headY = neckY + cUy * 0.09, headZ = neckZ + cUz * 0.09;
        this._setBone(B_HEAD, headX, headY, headZ, _axes[3], _axes[4], _axes[5], _axes[6], _axes[7], _axes[8]);

        this.hoodYaw = damp(this.hoodYaw, ch.facing + chestTwist + this.headYaw, 11, h);
        this.hoodPitch = damp(
            this.hoodPitch,
            (flipping ? rootPitch : chestPitch) + this.headPitch + 0.05,
            flipping ? 14 : 9,
            h
        );
        composeBasis(this.hoodYaw, this.hoodPitch, this.roll * 0.5);
        this._setBone(B_HOOD, headX, headY, headZ, _axes[3], _axes[4], _axes[5], _axes[6], _axes[7], _axes[8]);

        // -------------------------------------------------------------- arms
        this._poseArms(h, ch, chestX, chestY, chestZ, cRx, cRy, cRz, cUx, cUy, cUz, cFx, cFy, cFz);

        // -------------------------------------------------------------- legs
        this._poseLeg(0, gx, rootY, gz, rX, rY, rZ, uX, uY, uZ, fX, fY, fZ);
        this._poseLeg(1, gx, rootY, gz, rX, rY, rZ, uX, uY, uZ, fX, fY, fZ);

        // ------------------------------------------------------------- skin
        for (let b = 0; b < BONE_COUNT; b++) {
            mul(this.skin, b * 16, this.world, b * 16, this.invBind, b * 16);
            this.joint[b * 3] = this.world[b * 16 + 12];
            this.joint[b * 3 + 1] = this.world[b * 16 + 13];
            this.joint[b * 3 + 2] = this.world[b * 16 + 14];
        }
    }

    _setBone(b, px, py, pz, yx, yy, yz, zx, zy, zz) {
        // X = Y x Z, completing the frame from the bone axis and its front
        // reference. Both are already orthonormal at every call site.
        setFrameFromDir(this.world, b * 16, px, py, pz, yx, yy, yz, zx, zy, zz);
    }

    /**
     * Advance the stance/swing state machine and place both ankles.
     *
     * Stance is the whole point. `plant` is written exactly once, on touchdown,
     * and read unchanged for the rest of the stance — so no amount of body
     * motion, camera motion or frame-rate variation can move a planted foot.
     */
    /**
     * @param {number} h
     * @param {import("./controller.js").CharacterController} ch
     * @param {number} [rX] body right — required for airborne body-local feet
     * @param {number} [rY]
     * @param {number} [rZ]
     * @param {number} [uX] body up
     * @param {number} [uY]
     * @param {number} [uZ]
     * @param {number} [fX] body forward
     * @param {number} [fY]
     * @param {number} [fZ]
     * @param {number} [rootY] pelvis world Y
     */
    _updateFeet(h, ch, rX, rY, rZ, uX, uY, uZ, fX, fY, fZ, rootY) {
        const surf = ch.surf;
        const air = ch.air || 0;
        const speed = ch.speed;
        const run = Math.min(1, speed / 5.4);
        // Duty factor: a walk keeps both feet down for a moment, a run has a
        // flight phase. Interpolating between them is what makes the transition
        // from walk to run read as a gait change and not a speed change.
        const duty = 0.66 - 0.20 * run;

        const flatFwdX = Math.sin(ch.facing), flatFwdZ = Math.cos(ch.facing);
        const flatRgtX = Math.cos(ch.facing), flatRgtZ = -Math.sin(ch.facing);
        // Fall back to flat facing if called without a body frame (shouldn't happen).
        const hasBody = rX !== undefined && uX !== undefined && fX !== undefined;

        // Half a stride ahead, scaled by speed — this is the step length, and it
        // has to match the controller's stride or the feet skate.
        const half = 0.34 + 0.42 * run;
        // The controller owns this decision — see `stepping` there. Re-deriving
        // it from `surf` here is how the feet and the footprints end up
        // disagreeing about whether the character is walking.
        const moving = speed > 0.2 && ch.stepping;
        const airborne = air > 0.45 || ch.grounded === false;
        const flipping = !!ch.flipping || (ch.flipAngle || 0) > 0.05;
        const surfAir = ch.surfAir || 0;
        const olliePhase = ch.olliePhase || 0;
        const tuckAmt = this.flipTuckSm || ch.flipTuck || 0;

        for (let f = 0; f < 2; f++) {
            const side = f === 0 ? -0.105 : 0.105;
            // Left foot leads; the right is half a cycle behind.
            const ph = (ch.gaitPhase + (f === 0 ? 0 : 0.5)) % 1;
            const stance = !airborne && (!moving || ph < duty);

            // Where this foot would land if it touched down right now.
            const nx = ch.position.x + flatFwdX * half + flatRgtX * side;
            const nz = ch.position.z + flatFwdZ * half + flatRgtZ * side;

            if (airborne) {
                // Body-local feet. World-plant lag during spin = stretched corpse pose.
                this.touchdown[f] = false;
                let along, lateral, down;
                if (flipping) {
                    // Ball tuck: knees to chest, feet close under the torso.
                    // Negative "down" pulls ankles *up* the body axis toward the chest.
                    const t = Math.max(tuckAmt, 0.55);
                    along = f === 0 ? -0.02 - t * 0.10 : -0.10 - t * 0.12;
                    lateral = f === 0 ? -0.05 : 0.05;
                    down = 0.10 - t * 0.28; // ~-0.05 at peak → ankles near chest
                } else if (surfAir > 0.15) {
                    // Ollie: board under hips, never layout. Pop → float → land.
                    const p = olliePhase;
                    lateral = f === 0 ? -0.14 : 0.14;
                    if (p < 0.3) {
                        along = f === 0 ? 0.10 : -0.16;
                        down = f === 0 ? 0.11 : 0.18; // back foot loads the tail
                    } else if (p < 0.75) {
                        along = f === 0 ? 0.10 : -0.10;
                        down = 0.13;
                    } else {
                        along = f === 0 ? 0.07 : -0.07;
                        down = 0.15 + (p - 0.75) * 0.10;
                    }
                } else {
                    // Plain jump: hang under hips, knees soft — never full extension.
                    along = f === 0 ? 0.04 : -0.02;
                    lateral = f === 0 ? -0.08 : 0.08;
                    down = ch.velY > 0 ? 0.22 : 0.26;
                }

                let sx, sy, sz;
                if (hasBody) {
                    const py = rootY !== undefined ? rootY : ch.position.y + 0.95;
                    sx = ch.position.x + fX * along + rX * lateral - uX * down;
                    sy = py + fY * along + rY * lateral - uY * down;
                    sz = ch.position.z + fZ * along + rZ * lateral - uZ * down;
                } else {
                    sx = ch.position.x + flatFwdX * along + flatRgtX * lateral;
                    sz = ch.position.z + flatFwdZ * along + flatRgtZ * lateral;
                    sy = ch.position.y + 0.08 + (0.35 - down);
                }

                const o = f * 3;
                // Snap off the ground plant the moment we leave snow / start a flip.
                // Damping from plant → body target is what produced the corpse pose.
                const justAir = !this._wasAirborne;
                const justFlip = flipping && !this._wasFlipping;
                if (justAir || justFlip) {
                    this.footPos[o] = sx;
                    this.footPos[o + 1] = sy;
                    this.footPos[o + 2] = sz;
                } else {
                    const rate = flipping ? 40 : surfAir > 0.15 ? 22 : 14;
                    this.footPos[o] = damp(this.footPos[o], sx, rate, h);
                    this.footPos[o + 1] = damp(this.footPos[o + 1], sy, rate, h);
                    this.footPos[o + 2] = damp(this.footPos[o + 2], sz, rate, h);
                }
                const wantW = flipping ? 0 : surfAir > 0.2 ? 0.55 : 0;
                this.footWeight[f] = justAir || justFlip
                    ? wantW
                    : damp(this.footWeight[f], wantW, 18, h);
                this._wasStance[f] = false;
                continue;
            }

            if (stance) {
                if (!this._wasStance[f]) {
                    // Touchdown. This is the only line in the file that writes a
                    // plant position.
                    this.plant[f * 3] = nx;
                    this.plant[f * 3 + 1] = this.terrain.heightAt(nx, nz) - this.sink * 0.7;
                    this.plant[f * 3 + 2] = nz;
                    this.touchdown[f] = true;
                } else {
                    this.touchdown[f] = false;
                }
                if (!moving) {
                    // Standing: ease the feet back under the hips rather than
                    // leaving them wherever the last stride dropped them.
                    const sx = ch.position.x + flatRgtX * side + flatFwdX * 0.02;
                    const sz = ch.position.z + flatRgtZ * side + flatFwdZ * 0.02;
                    this.plant[f * 3] = damp(this.plant[f * 3], sx, 7, h);
                    this.plant[f * 3 + 2] = damp(this.plant[f * 3 + 2], sz, 7, h);
                    this.plant[f * 3 + 1] = damp(
                        this.plant[f * 3 + 1],
                        this.terrain.heightAt(this.plant[f * 3], this.plant[f * 3 + 2]) - this.sink * 0.7,
                        7, h
                    );
                }
                this.footPos[f * 3] = this.plant[f * 3];
                this.footPos[f * 3 + 1] = this.plant[f * 3 + 1];
                this.footPos[f * 3 + 2] = this.plant[f * 3 + 2];
                this.footWeight[f] = damp(this.footWeight[f], 1, 22, h);
            } else {
                this.touchdown[f] = false;
                // Swing: from the plant it is leaving to the plant it is heading
                // for, on an arc. `nx/nz` keeps updating as the body moves, so
                // the foot is always aimed at where the body will actually be.
                const s = (ph - duty) / (1 - duty);
                const e = s * s * (3 - 2 * s);
                const ny = this.terrain.heightAt(nx, nz) - this.sink * 0.7;
                const px = this.plant[f * 3], py = this.plant[f * 3 + 1], pz = this.plant[f * 3 + 2];
                this.footPos[f * 3] = px + (nx - px) * e;
                this.footPos[f * 3 + 2] = pz + (nz - pz) * e;
                this.footPos[f * 3 + 1] =
                    py + (ny - py) * e + Math.sin(Math.PI * s) * (0.055 + 0.12 * run);
                this.footWeight[f] = damp(this.footWeight[f], 0, 22, h);
            }

            this._wasStance[f] = stance;
        }

        // Surfing: both feet ride the board, offset along the body's long axis
        // and rotated across the direction of travel. Blended in, never snapped.
        if (surf > 0.001 && !airborne) {
            for (let f = 0; f < 2; f++) {
                // Wide and staggered: feet apart across the direction of travel
                // for lateral stability, with the leading foot a little ahead.
                const lateral = f === 0 ? -0.17 : 0.17;
                const along = f === 0 ? 0.11 : -0.11;
                const sx = ch.position.x + flatFwdX * along + flatRgtX * lateral;
                const sz = ch.position.z + flatFwdZ * along + flatRgtZ * lateral;
                const sy = this.terrain.heightAt(sx, sz) - this.sink;
                const o = f * 3;
                this.footPos[o] += (sx - this.footPos[o]) * surf;
                this.footPos[o + 1] += (sy - this.footPos[o + 1]) * surf;
                this.footPos[o + 2] += (sz - this.footPos[o + 2]) * surf;
                this.footWeight[f] = Math.max(this.footWeight[f], surf);
            }
        }

        this._wasAirborne = airborne;
        this._wasFlipping = flipping;
    }

    /**
     * Solve one leg. `f` is 0 for left, 1 for right.
     *
     * The knee pole tilts outward as well as forward, because a knee that bends
     * in a perfectly sagittal plane looks mechanical — real legs track slightly
     * wide of the hip.
     */
    _poseLeg(f, rootX, rootY, rootZ, rX, rY, rZ, uX, uY, uZ, fX, fY, fZ) {
        const side = f === 0 ? -0.10 : 0.10;
        const hipB = f === 0 ? B_THIGH_L : B_THIGH_R;
        const shinB = f === 0 ? B_SHIN_L : B_SHIN_R;
        const footB = f === 0 ? B_FOOT_L : B_FOOT_R;

        // Hip joint, carried by the pelvis frame.
        _hip[0] = rootX + rX * side - uX * 0.05;
        _hip[1] = rootY + rY * side - uY * 0.05;
        _hip[2] = rootZ + rZ * side - uZ * 0.05;

        const ax = this.footPos[f * 3];
        const ay = this.footPos[f * 3 + 1] + 0.09; // ankle sits above the sole
        const az = this.footPos[f * 3 + 2];

        const outward = f === 0 ? -0.22 : 0.22;
        solveTwoBone(
            _hip[0], _hip[1], _hip[2], ax, ay, az,
            fX + rX * outward, fY + rY * outward, fZ + rZ * outward,
            THIGH_LEN, SHIN_LEN, _knee
        );

        this._setBone(
            hipB, _hip[0], _hip[1], _hip[2],
            _knee[0] - _hip[0], _knee[1] - _hip[1], _knee[2] - _hip[2],
            fX, fY, fZ
        );
        this._setBone(
            shinB, _knee[0], _knee[1], _knee[2],
            ax - _knee[0], ay - _knee[1], az - _knee[2],
            fX, fY, fZ
        );

        // The foot rolls: flat while loaded, toe-down through the swing. The
        // ground normal is folded in so a foot on a dune face lies along it.
        const w = this.footWeight[f];
        const toeDown = (1 - w) * 0.55;
        const c = Math.cos(toeDown), s = Math.sin(toeDown);
        // Rotate the foot's forward axis down about the body's right axis.
        const dx = fX * c - uX * s, dy = fY * c - uY * s, dz = fZ * c - uZ * s;
        this._setBone(footB, ax, ay, az, dx, dy, dz, uX, uY, uZ);
    }

    /**
     * Arms. Counter-swing against the legs while walking, and a wide, low
     * bending stance while surfing — hands out and forward, which is the
     * Water Tribe pose in the reference and also just what a person does at
     * twenty metres a second.
     */
    _poseArms(h, ch, cx, cy, cz, rX, rY, rZ, uX, uY, uZ, fX, fY, fZ) {
        const surf = ch.surf;
        const air = ch.air || 0;
        const tuckAmt = this.flipTuckSm || ch.flipTuck || 0;
        const flipping = !!ch.flipping || (ch.flipAngle || 0) > 0.05;
        const surfAir = ch.surfAir || 0;
        const olliePhase = ch.olliePhase || 0;
        const run = Math.min(1, ch.speed / 5.4);
        const swing =
            Math.sin(2 * Math.PI * ch.gaitPhase) *
            (0.20 + 0.42 * run) *
            (1 - surf) *
            (1 - air) *
            (1 - tuckAmt) *
            (1 - surfAir);
        // Slow idle drift so a standing figure is never perfectly still.
        const idle = Math.sin(this._t * 0.9) * 0.02 + Math.sin(this._t * 1.7 + 1.3) * 0.012;

        for (let a = 0; a < 2; a++) {
            const sgn = a === 0 ? -1 : 1;
            const upperB = a === 0 ? B_UPPER_L : B_UPPER_R;
            const foreB = a === 0 ? B_FORE_L : B_FORE_R;
            const handB = a === 0 ? B_HAND_L : B_HAND_R;

            // Shoulder, on the chest frame.
            _sh[0] = cx + rX * (sgn * 0.185) + uX * 0.14;
            _sh[1] = cy + rY * (sgn * 0.185) + uY * 0.14;
            _sh[2] = cz + rZ * (sgn * 0.185) + uZ * 0.14;

            // ---- walk target: hand swings fore and aft below the hip --------
            //
            // Every offset here is kept comfortably inside the arm's 0.54 m
            // reach. Put the target at or past full extension and the IK solver
            // does exactly what it is told — locks the elbow — and the figure
            // walks around with two straight poles for arms.
            const sw = swing * -sgn;
            let tx = _sh[0] + fX * (sw * 0.38) - uX * 0.43 + rX * (sgn * 0.11);
            let ty = _sh[1] + fY * (sw * 0.38) - uY * 0.43 + rY * (sgn * 0.11);
            let tz = _sh[2] + fZ * (sw * 0.38) - uZ * 0.43 + rZ * (sgn * 0.11);
            ty += idle * sgn;

            // ---- flip tuck: arms hug shins hard in the CHEST frame ------------
            if (flipping) {
                const t = Math.max(tuckAmt, 0.55);
                const grab = Math.min(1, 0.55 + t * 0.45);
                // Hands low on the chest axis — ball shape, not T-pose mid-spin.
                const hx = _sh[0] + fX * (0.02 - t * 0.06) - uX * (0.18 + t * 0.28) + rX * (sgn * 0.04);
                const hy = _sh[1] + fY * (0.02 - t * 0.06) - uY * (0.18 + t * 0.28) + rY * (sgn * 0.04);
                const hz = _sh[2] + fZ * (0.02 - t * 0.06) - uZ * (0.18 + t * 0.28) + rZ * (sgn * 0.04);
                tx += (hx - tx) * grab;
                ty += (hy - ty) * grab;
                tz += (hz - tz) * grab;
            } else if (surfAir > 0.12) {
                // ---- ollie arms: natural board balance, not a T-pose ----------
                // Pop: arms swing up a little for lift. Float: out for balance.
                // Land: come back in.
                const p = olliePhase;
                const bal = Math.min(1, 0.55 + surfAir * 0.45);
                let up = 0.06, out = 0.18, fwd = 0.10;
                if (p < 0.3) {
                    up = 0.16; out = 0.14; fwd = 0.06; // pump
                } else if (p < 0.75) {
                    up = 0.08; out = 0.24; fwd = 0.12; // balance
                } else {
                    up = 0.02; out = 0.12; fwd = 0.08; // settle
                }
                // Lead hand a touch more forward (right = a===1).
                if (a === 1) fwd += 0.04;
                else fwd -= 0.02;
                const ox = _sh[0] + fX * fwd + uX * up + rX * (sgn * out);
                const oy = _sh[1] + fY * fwd + uY * up + rY * (sgn * out);
                const oz = _sh[2] + fZ * fwd + uZ * up + rZ * (sgn * out);
                tx += (ox - tx) * bal;
                ty += (oy - ty) * bal;
                tz += (oz - tz) * bal;
            } else if (air > 0.45) {
                // Soft air: arms out a little for balance.
                tx += rX * (sgn * 0.08) * air;
                ty += rY * (sgn * 0.08) * air - uY * 0.04 * air;
                tz += rZ * (sgn * 0.08) * air;
            }

            // ---- cast target: both hands up and out along the aim -----------
            //
            // A wide base, the leading hand extended along the flow and the
            // trailing hand drawn back across the body, so the arms describe the
            // arc the water is about to take. The right hand leads because that
            // is the hand the ribbon is emitted from.
            //
            // Blended, not switched, and it composes with the walk swing rather
            // than replacing it — a character casting while walking still walks.
            const cast = ch.cast;
            if (cast > 0.001) {
                const ax = ch.castAimX, ay = ch.castAimY, az = ch.castAimZ;
                // The leading hand reaches along the aim; the trailing one sits
                // low and inboard, cocked back.
                const lead = a === 1 ? 1 : 0;
                const outward = lead ? 0.30 : -0.16;
                const along = lead ? 0.52 : 0.16;
                const lift = lead ? 0.26 : 0.02;
                const cx = _sh[0] + rX * (sgn * 0.30 + outward * sgn) + ax * along + uX * lift;
                const cy = _sh[1] + rY * (sgn * 0.30) + ay * along + uY * lift + lift * 0.6;
                const cz = _sh[2] + rZ * (sgn * 0.30 + outward * sgn) + az * along + uZ * lift;
                tx += (cx - tx) * cast;
                ty += (cy - ty) * cast;
                tz += (cz - tz) * cast;
            }

            // ---- surf target: out, forward and a little down ----------------
            if (surf > 0.001) {
                const carve = ch.carve;
                // Trailing arm rises, leading arm drops into the turn — the
                // same asymmetry a snowboarder holds through a carve.
                const rise = 0.02 + carve * sgn * 0.22;
                const sx = _sh[0] + rX * (sgn * 0.33) + fX * 0.24 + uX * rise;
                const sy = _sh[1] + rY * (sgn * 0.33) + fY * 0.24 + uY * rise;
                const sz = _sh[2] + rZ * (sgn * 0.33) + fZ * 0.24 + uZ * rise;
                tx += (sx - tx) * surf;
                ty += (sy - ty) * surf;
                tz += (sz - tz) * surf;
            }

            // Elbows point back and out.
            const px = -fX + rX * (sgn * 0.55), py = -fY + rY * (sgn * 0.55) - 0.35, pz = -fZ + rZ * (sgn * 0.55);
            solveTwoBone(
                _sh[0], _sh[1], _sh[2], tx, ty, tz, px, py, pz,
                UPPER_LEN, FORE_LEN, _p
            );

            this._setBone(
                upperB, _sh[0], _sh[1], _sh[2],
                _p[0] - _sh[0], _p[1] - _sh[1], _p[2] - _sh[2],
                fX, fY, fZ
            );
            this._setBone(
                foreB, _p[0], _p[1], _p[2],
                tx - _p[0], ty - _p[1], tz - _p[2],
                fX, fY, fZ
            );
            // The hand continues the forearm, rolled palm-inward.
            let hx = tx - _p[0], hy = ty - _p[1], hz = tz - _p[2];
            const hl = Math.hypot(hx, hy, hz) || 1;
            hx /= hl; hy /= hl; hz /= hl;
            this._setBone(handB, tx, ty, tz, hx, hy, hz, fX, fY, fZ);
        }
    }

    /** World position of a hand, for spell emitters. Writes 3 floats to `out`. */
    handPosition(which, out, od) {
        const b = which === 0 ? B_HAND_L : B_HAND_R;
        xformPoint(this.world, b * 16, 0, 0.09, 0, out, od);
    }
}

export { HIP_HEIGHT };
