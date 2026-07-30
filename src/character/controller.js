/**
 * Character locomotion + snow-surf + jump physics.
 *
 * This owns motion only — the visual rig, cloth and fur read the state this
 * produces. Modes share one integrator:
 *
 *  - WALK: camera-relative desired velocity, eased facing, distance-driven gait
 *    phase so footfalls land where the feet actually are (no sliding).
 *  - SURF: momentum-carrying. Thrust along facing, steering from mouse yaw,
 *    strong lateral grip that bleeds into a drift as you push the carve, and
 *    slope-driven acceleration so dropping down a dune face feels like a gain.
 *  - JUMP: real vertical velocity while airborne; coyote + jump-buffer so the
 *    press still lands on uneven snow. Hold shortens hang time (cut jump).
 *
 * Blending between walk/surf is eased in both directions; there is no snap.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scalar } from "@babylonjs/core/Maths/math.scalar";
import { input } from "../core/input.js";
import { expDamp } from "../core/camera.js";

const _wish = new Vector3();
const _fwd = new Vector3();
const _right = new Vector3();
const _tmp = new Vector3();
const _n = new Vector3();

const WALK_SPEED = 2.5;
const RUN_SPEED = 5.4;
const WALK_ACCEL = 26;
const WALK_DECEL = 30;

const SURF_MAX = 19.5;
const SURF_THRUST = 11.0;
const SURF_DRAG = 0.42;
const SURF_TURN = 2.35; // rad/s at full steer
const SURF_GRIP = 7.5;

/** Jump / air. Take-off ~4.8 m/s → ~1.15 m peak under GRAVITY. */
const GRAVITY = -22.0;
const JUMP_SPEED = 4.85;
const JUMP_DOUBLE = 4.55; // second press in air
const JUMP_SURF = 5.45; // ollie pop — modest hang, not a hang-glider
/** Forward kick on ollie, m/s, scaled by board speed01. */
const OLLIE_BOOST = 1.55;
const OLLIE_BOOST_SPEED = 2.35; // extra at full surf speed
/** Keep board speed through the ollie (1 = inherit, no free speed). */
const OLLIE_SPEED_KEEP = 1.0;
const JUMP_CUT = 0.42; // multiply upward vel when jump released early
const COYOTE = 0.11; // seconds after leaving ground still jumpable
const JUMP_BUFFER = 0.12; // seconds a press waits for landing
const TAKEOFF_LOCK = 0.14; // ignore ground snap right after leaving the snow
const DOUBLE_LOCK = 0.08; // brief lock after double so ground doesn't eat it
const AIR_ACCEL = 14.0;
const GROUND_SNAP = 0.08; // metres of snap when nearly grounded
const COLLISION_RADIUS = 0.34;
const COLLISION_HEIGHT = 1.55;
/** Front-flip duration after a double jump, seconds. */
const FLIP_TIME = 0.72;
/** Ollie pose timeline length (independent of hang time). */
const OLLIE_POSE_TIME = 0.55;

/** Gait: metres of travel per full stride cycle, scaled by speed. */
const STRIDE_BASE = 1.55;

export class CharacterController {
    /**
     * @param {{ heightAt(x:number,z:number):number, normalAt(x:number,z:number,out:Vector3):Vector3 }} terrain
     * @param {readonly {minX:number, minY:number, minZ:number, maxX:number, maxY:number, maxZ:number}[]} [obstacles]
     */
    constructor(terrain, obstacles = []) {
        this.terrain = terrain;
        this.obstacles = obstacles;

        this.position = new Vector3(0, 0, 0);
        this.velocity = new Vector3(0, 0, 0);
        this.prevVelocity = new Vector3(0, 0, 0);
        this.acceleration = new Vector3(0, 0, 0);

        this.facing = 0; // yaw, radians
        this.speed = 0;
        this.speed01 = 0; // normalised against SURF_MAX, for FOV/wind

        /** 0 = walking, 1 = fully surfing. Eased. */
        this.surf = 0;
        this.surfActive = false;

        /**
         * 0 = not casting, 1 = fully in the bending stance. Written by the spell
         * system, read by the figure.
         *
         * It lives here rather than on the spell system because the figure
         * already reads the controller for everything else it poses from, and a
         * second source of "what is this character doing" is how the arms and the
         * legs end up disagreeing about which frame it is.
         */
        this.cast = 0;
        this.castAimX = 0;
        this.castAimY = 0;
        this.castAimZ = 1;

        /** Signed lean, -1..1 (right positive), from lateral acceleration. */
        this.lean = 0;
        /** Signed carve amount for wake shaping. Positive = turning right. */
        this.carve = 0;
        /**
         * 0..1, how hard the screen-space speed streaks should read. Deadbanded
         * well above walking pace: streaks at a jog make the demo feel cheap.
         */
        this.streak01 = 0;

        // ------------------------------------------------------------- gait
        this.gaitPhase = 0;
        /**
         * True when the legs should be running a gait at all.
         *
         * One flag, read by the figure and by the contact system, because three
         * copies of "is this character walking" is three chances for the feet to
         * disagree with the footprints.
         */
        this.stepping = true;
        /** Set true for exactly one frame when a foot plants. */
        this.footfall = false;
        /** 0 = left foot, 1 = right foot — which foot just planted. */
        this.footIndex = 0;
        /** World position of the foot that just planted. */
        this.footPos = new Vector3();
        /** Impact strength 0..1, scales spray and deformation depth. */
        this.footImpact = 0;

        this.groundY = 0;
        this.groundNormal = new Vector3(0, 1, 0);

        /** True while feet are on (or within snap of) the snow. */
        this.grounded = true;
        /** 0 on ground, 1 fully airborne — eased for the figure. */
        this.air = 0;
        /** Vertical velocity, m/s. Positive up. */
        this.velY = 0;
        /** 0..1 takeoff impulse, one-frame spike for pose / spray. */
        this.jumpPulse = 0;
        /** 0..1 landing impact, one-frame spike for crouch recover. */
        this.landPulse = 0;
        /**
         * Which takeoff just fired (one frame):
         * 0 none · 1 ground · 2 double (flip) · 3 surf ollie
         */
        this.jumpKind = 0;
        /** How many jumps used this airtime (0 grounded, 1 after first, 2 after double). */
        this.jumpsUsed = 0;
        /** 0..1 front-flip timeline (eased). */
        this.flip = 0;
        /** Radians of front-flip already applied — figure adds this to root pitch. */
        this.flipAngle = 0;
        /** 0..1 tuck envelope (peaks mid-flip, 0 at start/end). */
        this.flipTuck = 0;
        /** True while a double-jump flip is playing out. */
        this.flipping = false;
        /** Carries board stance into the air after a surf ollie. */
        this.surfAir = 0;
        /** 0..1 ollie flight timeline (pop → float → land prep). Figure reads this. */
        this.olliePhase = 0;

        this._coyote = 0;
        this._ollieT = 0;
        this._jumpBuffer = 0;
        this._wasGrounded = true;
        this._jumpHeld = false;
        /** Must release jump before another takeoff (blocks auto bunny-hop). */
        this._jumpArmed = true;
        /** Seconds remaining where ground cannot re-attach after takeoff. */
        this._takeoffLock = 0;
        this._flipT = 0;
        this._prevVelY = 0;
        /** @type {import("../core/camera.js").CameraRig|null} */
        this._rig = null;

        this._prevSpeed = 0;
    }

    /**
     * @param {number} dt
     * @param {import("../core/camera.js").CameraRig} rig
     */
    update(dt, rig) {
        const h = Math.min(dt, 1 / 30);

        this.prevVelocity.copyFrom(this.velocity);
        this.jumpPulse = 0;
        this.landPulse = 0;
        this.jumpKind = 0;
        this._rig = rig;

        // Board input only sticks while grounded; surfAir keeps the stance aloft
        // after an ollie so the figure doesn't drop into a walk mid-flight.
        this.surfActive = input.surf && this.grounded;
        const surfWant = this.surfActive ? 1 : this.surfAir > 0.15 ? 0.82 * this.surfAir : 0;
        this.surf = expDamp(this.surf, surfWant, this.surfActive ? 2.6 : 3.4, h);
        // Hold board-air pose through the flight; snap off on landing via _resolveGround.
        if (this.grounded && this.surfAir > 0) this.surfAir = expDamp(this.surfAir, 0, 10, h);

        rig.getFlatForward(_fwd);
        rig.getFlatRight(_right);

        if (this.surfActive && this.surf > 0.5) this._surfStep(h, rig);
        else this._walkStep(h);

        // ----------------------------------------------------------- jump / air
        this._jumpStep(h);
        this._flipStep(h);
        this._olliePoseStep(h);

        // ---------------------------------------------------- integrate XZ + Y
        this._resolveObstacles(this.velocity.x * h, this.velocity.z * h);
        this.position.y += this.velY * h;

        this.groundY = this.terrain.heightAt(this.position.x, this.position.z);
        this.terrain.normalAt(this.position.x, this.position.z, this.groundNormal);
        this._resolveGround(h);

        // --------------------------------------------------------- bookkeeping
        this.speed = Math.hypot(this.velocity.x, this.velocity.z);
        this.speed01 = Scalar.Clamp(this.speed / SURF_MAX, 0, 1);

        this.acceleration.x = (this.velocity.x - this.prevVelocity.x) / h;
        this.acceleration.y = (this.velY - this._prevVelY) / h;
        this.acceleration.z = (this.velocity.z - this.prevVelocity.z) / h;
        this._prevVelY = this.velY;

        // Lateral acceleration → lean. Project accel onto the character's right.
        const rx = Math.cos(this.facing);
        const rz = -Math.sin(this.facing);
        const latAcc = this.acceleration.x * rx + this.acceleration.z * rz;
        const leanWant = Scalar.Clamp(latAcc / 26, -1, 1) * (0.35 + 0.65 * this.surf) * (1 - this.air * 0.55);
        this.lean = expDamp(this.lean, leanWant, 6.5, h);
        this.carve = expDamp(this.carve, leanWant, 9, h);

        this.streak01 = this.surf * Scalar.Clamp((this.speed - 7) / 11, 0, 1);
        this.air = expDamp(this.air, this.grounded ? 0 : 1, this.grounded ? 14 : 10, h);

        this._gait(h);
    }

    /**
     * Sweeps the character's horizontal cylinder against static world volumes.
     * Separating the axes preserves a natural wall slide instead of stopping all
     * movement at the first corner contact.
     */
    _resolveObstacles(dx, dz) {
        const obstacles = this.obstacles;
        if (obstacles.length === 0) {
            this.position.x += dx;
            this.position.z += dz;
            return;
        }

        const y0 = this.position.y;
        const y1 = y0 + COLLISION_HEIGHT;
        let x = this.position.x;
        let z = this.position.z;
        let hitX = false;

        if (dx !== 0) {
            let nextX = x + dx;
            for (let i = 0; i < obstacles.length; i++) {
                const o = obstacles[i];
                if (y1 <= o.minY || y0 >= o.maxY || z < o.minZ - COLLISION_RADIUS || z > o.maxZ + COLLISION_RADIUS) continue;
                if (dx > 0 && x <= o.minX - COLLISION_RADIUS && nextX > o.minX - COLLISION_RADIUS) {
                    nextX = Math.min(nextX, o.minX - COLLISION_RADIUS);
                    hitX = true;
                } else if (dx < 0 && x >= o.maxX + COLLISION_RADIUS && nextX < o.maxX + COLLISION_RADIUS) {
                    nextX = Math.max(nextX, o.maxX + COLLISION_RADIUS);
                    hitX = true;
                }
            }
            x = nextX;
        }

        let hitZ = false;
        if (dz !== 0) {
            let nextZ = z + dz;
            for (let i = 0; i < obstacles.length; i++) {
                const o = obstacles[i];
                if (y1 <= o.minY || y0 >= o.maxY || x < o.minX - COLLISION_RADIUS || x > o.maxX + COLLISION_RADIUS) continue;
                if (dz > 0 && z <= o.minZ - COLLISION_RADIUS && nextZ > o.minZ - COLLISION_RADIUS) {
                    nextZ = Math.min(nextZ, o.minZ - COLLISION_RADIUS);
                    hitZ = true;
                } else if (dz < 0 && z >= o.maxZ + COLLISION_RADIUS && nextZ < o.maxZ + COLLISION_RADIUS) {
                    nextZ = Math.max(nextZ, o.maxZ + COLLISION_RADIUS);
                    hitZ = true;
                }
            }
            z = nextZ;
        }

        this.position.x = x;
        this.position.z = z;
        if (hitX) this.velocity.x = 0;
        if (hitZ) this.velocity.z = 0;
    }

    _walkStep(h) {
        // Surf ollie carries board speed — do NOT steer XZ toward walk max or the
        // hop dies into a 5 m/s float after one frame of air accel.
        if (!this.grounded && this.surfAir > 0.2) {
            this._ollieAirSteer(h);
            return;
        }

        const maxSpeed = input.sprint ? RUN_SPEED : WALK_SPEED;
        const accel = this.grounded ? WALK_ACCEL : AIR_ACCEL;
        const decel = this.grounded ? WALK_DECEL : AIR_ACCEL * 0.55;

        _wish.set(
            _fwd.x * input.moveZ + _right.x * input.moveX,
            0,
            _fwd.z * input.moveZ + _right.z * input.moveX
        );

        const wishLen = Math.hypot(_wish.x, _wish.z);
        if (wishLen > 0.001) {
            _wish.x = (_wish.x / wishLen) * maxSpeed;
            _wish.z = (_wish.z / wishLen) * maxSpeed;

            const a = accel * h;
            this.velocity.x += Scalar.Clamp(_wish.x - this.velocity.x, -a, a);
            this.velocity.z += Scalar.Clamp(_wish.z - this.velocity.z, -a, a);

            // Face the direction of travel, eased.
            const want = Math.atan2(_wish.x, _wish.z);
            this.facing = angleDamp(this.facing, want, this.grounded ? 11 : 6, h);
        } else if (this.grounded) {
            const d = decel * h;
            const s = Math.hypot(this.velocity.x, this.velocity.z);
            if (s > 0.0001) {
                const k = Math.max(0, s - d) / s;
                this.velocity.x *= k;
                this.velocity.z *= k;
            }
        }
    }

    /** Light air steer while carrying ollie momentum — no speed cap to walk. */
    _ollieAirSteer(h) {
        // A/D lean the flight a little; W keeps facing thrust, S trims a bit.
        const steer = Scalar.Clamp(input.moveX, -1, 1);
        if (Math.abs(steer) > 0.01) {
            this.facing += steer * 0.9 * h;
            const rx = Math.cos(this.facing);
            const rz = -Math.sin(this.facing);
            this.velocity.x += rx * steer * 2.0 * h;
            this.velocity.z += rz * steer * 2.0 * h;
        }
        if (input.moveZ > 0.01) {
            const fx = Math.sin(this.facing);
            const fz = Math.cos(this.facing);
            this.velocity.x += fx * 1.4 * h * input.moveZ;
            this.velocity.z += fz * 1.4 * h * input.moveZ;
        } else if (input.moveZ < -0.01) {
            const s = Math.hypot(this.velocity.x, this.velocity.z);
            if (s > 0.001) {
                const k = Math.max(0, 1 + input.moveZ * 0.7 * h);
                this.velocity.x *= k;
                this.velocity.z *= k;
            }
        }
        // Noticeable drag so the hop settles instead of skating forever.
        const s = Math.hypot(this.velocity.x, this.velocity.z);
        if (s > 0.001) {
            const drag = (1.15 + s * 0.04) * h;
            const k = Math.max(0, s - drag) / s;
            this.velocity.x *= k;
            this.velocity.z *= k;
        }
    }

    _jumpStep(h) {
        this._takeoffLock = Math.max(0, this._takeoffLock - h);

        // Rising edge only arms the buffer. Holding Space after takeoff must not
        // keep the buffer full or the character bunny-hops on every landing.
        if (input.jumpPressed && this._jumpArmed) {
            this._jumpBuffer = JUMP_BUFFER;
        } else {
            this._jumpBuffer = Math.max(0, this._jumpBuffer - h);
        }

        // Re-arm only after the binding is fully released.
        if (!input.jump) {
            this._jumpArmed = true;
            this._jumpHeld = false;
        }

        if (this.grounded && this._takeoffLock <= 0) {
            this._coyote = COYOTE;
            this.jumpsUsed = 0;
        } else {
            this._coyote = Math.max(0, this._coyote - h);
        }

        const wantJump = this._jumpArmed && this._jumpBuffer > 0 && this._takeoffLock <= 0;
        const canGround =
            wantJump && (this.grounded || this._coyote > 0) && this.jumpsUsed === 0;
        // Second press in the air → double jump + front flip.
        // Second press in the air. Do NOT gate on `this.air` — that blend lags
        // ~0.2s after takeoff, so a quick double-tap never armed the flip.
        const canDouble =
            wantJump &&
            !this.grounded &&
            this.jumpsUsed === 1 &&
            this._coyote <= 0;

        if (canGround) {
            const fromSurf = this.surf > 0.45 || this.surfActive;
            this._doJump(fromSurf ? "surf" : "ground");
        } else if (canDouble) {
            this._doJump("double");
        }

        // Variable jump: release early → cut upward velocity (ground/surf only).
        if (this._jumpHeld && !input.jump && this.velY > 0 && this.jumpsUsed < 2) {
            this.velY *= JUMP_CUT;
            this._jumpHeld = false;
        }

        if (!this.grounded || this._takeoffLock > 0) {
            this.velY += GRAVITY * h;
            // Terminal fall so long drops don't nuke the landing pose.
            if (this.velY < -16) this.velY = -16;
        }
    }

    /**
     * @param {"ground"|"double"|"surf"} kind
     */
    _doJump(kind) {
        const fromSurf = kind === "surf";
        const isDouble = kind === "double";

        if (isDouble) {
            // Reset upward speed so the second pop always reads, even mid-fall.
            this.velY = Math.max(this.velY * 0.15, 0) + JUMP_DOUBLE;
            this.jumpsUsed = 2;
            // Drop board-air state — flip is a ball, not an ollie carry.
            this.surfAir = 0;
            this.olliePhase = 0;
            this._ollieT = 0;
            this._startFlip();
            this.jumpPulse = 1;
            this.jumpKind = 2;
            // Tiny forward kick so the flip travels.
            const fx = Math.sin(this.facing);
            const fz = Math.cos(this.facing);
            this.velocity.x += fx * 0.9;
            this.velocity.z += fz * 0.9;
            this._takeoffLock = DOUBLE_LOCK;
            this._rig?.addTrauma?.(0.22);
        } else if (fromSurf) {
            this.velY = JUMP_SURF + this.speed01 * 0.35;
            this.jumpsUsed = 1;
            this.surfAir = 1;
            this._ollieT = 0;
            this.olliePhase = 0;
            // Never carry a leftover flip into an ollie.
            this.flipping = false;
            this.flip = 0;
            this.flipAngle = 0;
            this.flipTuck = 0;
            this._flipT = 0;
            this.jumpPulse = 1.05;
            this.jumpKind = 3;
            // Inherit board speed, then a modest nose kick — readable, not a rocket.
            this.velocity.x *= OLLIE_SPEED_KEEP;
            this.velocity.z *= OLLIE_SPEED_KEEP;
            const fx = Math.sin(this.facing);
            const fz = Math.cos(this.facing);
            const kick = OLLIE_BOOST + this.speed01 * OLLIE_BOOST_SPEED;
            this.velocity.x += fx * kick;
            this.velocity.z += fz * kick;
            const s = Math.hypot(this.velocity.x, this.velocity.z);
            const cap = SURF_MAX * 1.06;
            if (s > cap) {
                const k = cap / s;
                this.velocity.x *= k;
                this.velocity.z *= k;
            }
            this._takeoffLock = TAKEOFF_LOCK;
            this._jumpHeld = true;
            this._rig?.addTrauma?.(0.14 + this.speed01 * 0.18);
        } else {
            this.velY = JUMP_SPEED;
            this.jumpsUsed = 1;
            this.jumpPulse = 1;
            this.jumpKind = 1;
            if (input.moving) {
                const boost = input.sprint ? 0.55 : 0.25;
                this.velocity.x += _fwd.x * input.moveZ * boost + _right.x * input.moveX * boost;
                this.velocity.z += _fwd.z * input.moveZ * boost + _right.z * input.moveX * boost;
            }
            this._takeoffLock = TAKEOFF_LOCK;
            this._jumpHeld = true;
        }

        this.grounded = false;
        this._coyote = 0;
        this._jumpBuffer = 0;
        this._jumpArmed = false;
        this.position.y = Math.max(this.position.y, this.groundY) + GROUND_SNAP + 0.05;
    }

    _startFlip() {
        this.flipping = true;
        this._flipT = 0;
        this.flip = 0;
        // Seed a real tuck + a few degrees so frame 0 is already a ball, not layout.
        this.flipAngle = 0.18;
        this.flipTuck = 0.7;
    }

    _flipStep(h) {
        if (!this.flipping) {
            this.flip = 0;
            this.flipAngle = 0;
            if (this.flipTuck > 0.001) this.flipTuck = expDamp(this.flipTuck, 0, 14, h);
            else this.flipTuck = 0;
            return;
        }
        this._flipT += h;
        const u = Math.min(1, this._flipT / FLIP_TIME);
        // Smoothstep — limbs stay tucked; spin is body pitch only.
        const e = u * u * (3 - 2 * u);
        this.flip = e;
        this.flipAngle = e * Math.PI * 2;
        // Hold a deep ball most of the spin; open only in the last ~15% for land.
        // sin(πe) alone went to 0 at both ends → layout frames = corpse pose.
        const open = Math.max(0, (e - 0.85) / 0.15);
        this.flipTuck = 0.72 + 0.28 * Math.sin(Math.PI * e) * (1 - open) - 0.55 * open;
        this.flipTuck = Math.max(0, Math.min(1, this.flipTuck));
        if (u >= 1) {
            this.flipping = false;
            this.flip = 0;
            this.flipAngle = 0;
            this.flipTuck = 0;
            this._flipT = 0;
        }
    }

    /** Advances ollie pose clock while airborne on a board hop. */
    _olliePoseStep(h) {
        if (this.surfAir < 0.05 || this.grounded) {
            if (this.grounded) {
                this.olliePhase = 0;
                this._ollieT = 0;
            } else if (this.olliePhase > 0) {
                this.olliePhase = expDamp(this.olliePhase, 0, 8, h);
            }
            return;
        }
        this._ollieT += h;
        // Phase runs 0→1 over OLLIE_POSE_TIME then holds near 1 (land-prep) until touchdown.
        const u = Math.min(1, this._ollieT / OLLIE_POSE_TIME);
        this.olliePhase = u * u * (3 - 2 * u);
    }

    _resolveGround(h) {
        const gy = this.groundY;
        const was = this._wasGrounded;

        // Just left the snow — do not snap back or the jump dies / retriggers.
        if (this._takeoffLock > 0 && this.velY > 0) {
            this.grounded = false;
            this._wasGrounded = false;
            return;
        }

        if (this.velY <= 0.05 && this.position.y <= gy + GROUND_SNAP) {
            // Landing / stay grounded.
            if (!was || this.position.y < gy - 0.002) {
                let impact = Scalar.Clamp((-this.velY - 1.5) / 9, 0, 1);
                // Surf ollie / flip landings hit harder visually.
                if (this.surfAir > 0.3) impact = Math.min(1, impact + 0.25 + this.speed01 * 0.2);
                if (this.jumpsUsed >= 2) impact = Math.min(1, impact + 0.15);
                if (impact > 0.05) this.landPulse = impact;
                if (impact > 0.35) this._rig?.addTrauma?.(impact * 0.2);
            }
            this.position.y = gy;
            this.velY = 0;
            this.grounded = true;
            this._takeoffLock = 0;
            this.jumpsUsed = 0;
            this.surfAir = 0;
            this.olliePhase = 0;
            this._ollieT = 0;
            this.flipping = false;
            this.flip = 0;
            this.flipAngle = 0;
            this.flipTuck = 0;
            this._flipT = 0;
        } else if (this.position.y > gy + GROUND_SNAP) {
            this.grounded = false;
        } else if (this.grounded) {
            // Soft follow while walking so micro-ripples don't jitter, without
            // killing a real jump the moment it starts.
            this.position.y = expDamp(this.position.y, gy, 26, h);
            this.velY = 0;
        }

        this._wasGrounded = this.grounded;
    }

    _surfStep(h, rig) {
        // Steer from the mouse (camera yaw drift) plus explicit A/D.
        const steer = Scalar.Clamp(
            input.moveX * 0.85 + angleDelta(this.facing, rig.yaw) * 1.25,
            -1,
            1
        );
        this.facing += steer * SURF_TURN * h;

        // Camera shake, and only from the one thing that earns it: an edge
        // loaded up at speed. Added as a rate rather than as an impulse, so it
        // reaches an equilibrium against the rig's own decay — hard carve at top
        // speed settles around 0.4 trauma, which is a couple of centimetres of
        // rig movement. Anything you can consciously see here is too much.
        const load = Math.abs(steer) * (this.speed / SURF_MAX);
        if (load > 0.25) rig.addTrauma((load - 0.25) * 1.35 * h);

        const fx = Math.sin(this.facing);
        const fz = Math.cos(this.facing);

        // Slope: heading downhill adds speed, uphill scrubs it.
        this.terrain.normalAt(this.position.x, this.position.z, _n);
        const slopeAssist = -(_n.x * fx + _n.z * fz) * 26;

        let thrust = SURF_THRUST + slopeAssist;
        if (input.moveZ < 0) thrust -= 14; // pull back to scrub speed

        this.velocity.x += fx * thrust * h;
        this.velocity.z += fz * thrust * h;

        // Lateral grip: kill sideways velocity, but not entirely — the residual
        // is what reads as a drift when you overcook the turn.
        const rx = Math.cos(this.facing);
        const rz = -Math.sin(this.facing);
        const lat = this.velocity.x * rx + this.velocity.z * rz;
        const grip = Math.min(1, SURF_GRIP * h);
        this.velocity.x -= rx * lat * grip;
        this.velocity.z -= rz * lat * grip;

        // Quadratic drag → a natural terminal speed.
        const s = Math.hypot(this.velocity.x, this.velocity.z);
        if (s > 0.0001) {
            const drag = SURF_DRAG * s * s * 0.02 + 0.9;
            const k = Math.max(0, s - drag * h) / s;
            this.velocity.x *= k;
            this.velocity.z *= k;
        }
        if (s > SURF_MAX) {
            const k = SURF_MAX / s;
            this.velocity.x *= k;
            this.velocity.z *= k;
        }
    }

    /**
     * Distance-driven gait. Phase advances with ground travelled, not with time,
     * which is what keeps feet planted instead of sliding.
     */
    _gait(h) {
        this.footfall = false;

        // Feet stay on the board while surfing — and for the run-out afterwards.
        //
        // The surf blend eases to zero in a fifth of a second, but the momentum
        // takes two thirds of one to bleed off, and in between the character is
        // travelling at nineteen metres a second. The gait is distance-driven, so
        // it answered that with a twelve-hertz cadence and the legs blurred. A
        // sprint is the fastest thing anyone walks at; above it, glide.
        // No gait in the air or on the board — feet free for jump pose / surf stance.
        this.stepping =
            this.grounded &&
            this.air < 0.35 &&
            this.surf <= 0.5 &&
            this.speed <= RUN_SPEED * 1.2;
        if (!this.stepping) {
            this.gaitPhase = 0;
            return;
        }

        const dist = this.speed * h;
        const stride = STRIDE_BASE * (0.72 + 0.28 * Math.min(1, this.speed / RUN_SPEED));
        const prev = this.gaitPhase;
        this.gaitPhase = (this.gaitPhase + dist / stride) % 1;

        if (this.speed < 0.15) return;

        // Two plants per cycle, at phase 0.0 and 0.5.
        const crossed =
            (prev < 0.5 && this.gaitPhase >= 0.5) || this.gaitPhase < prev;
        if (!crossed) return;

        this.footfall = true;
        this.footIndex = this.gaitPhase < 0.5 ? 0 : 1;
        this.footImpact = Scalar.Clamp(0.35 + this.speed / RUN_SPEED, 0, 1.3);

        // Offset the plant to the correct side of the body.
        const side = this.footIndex === 0 ? -0.17 : 0.17;
        const rx = Math.cos(this.facing);
        const rz = -Math.sin(this.facing);
        this.footPos.set(
            this.position.x + rx * side,
            this.position.y,
            this.position.z + rz * side
        );
    }
}

// ------------------------------------------------------------------ helpers

/** Shortest signed delta from a to b, wrapped to [-PI, PI]. */
export function angleDelta(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
}

/** Framerate-independent easing across the shortest arc. */
export function angleDamp(cur, target, rate, dt) {
    return cur + angleDelta(cur, target) * (1 - Math.exp(-rate * dt));
}
