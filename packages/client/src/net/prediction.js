/**
 * Local move samples + lightweight reconciliation (Phase 1).
 *
 * Client remains the feel authority (full CharacterController).
 * Server validates step/speed and echoes state to peers.
 * Soft snap if server corrects our own pose far from local.
 */

import { inferAnim, MSG_MOVE } from "@snowflow/shared";

export class MoveSampler {
    constructor() {
        /** @type {number} */
        this.seq = 0;
        /** @type {number} */
        this._acc = 0;
        /** send at ~20 Hz to match TICK_RATE */
        this.hz = 20;
        /** @type {number} last acknowledged server seq for local player */
        this.ackSeq = 0;
    }

    /**
     * @param {number} dt
     * @param {import('../character/controller.js').CharacterController} character
     * @param {{ send(type: string, payload: object): void } | null} session
     * @param {{ yaw?: number, pitch?: number }} [look]
     */
    update(dt, character, session, look = {}) {
        if (!session || !character) return;
        this._acc += dt;
        const period = 1 / this.hz;
        if (this._acc < period) return;
        this._acc %= period;
        this.seq += 1;

        // Send both boolean and eased blend — remotes need the blend for board pitch.
        const surf = Number(character.surf) || 0;
        const surfing = !!(character.surfActive || surf > 0.35);
        const grounded = !!character.grounded;
        const speed01 = character.speed01 ?? 0;
        const flipping = !!character.flipping;
        const jumpKind = character.jumpKind | 0;
        const olliePhase = character.olliePhase ?? 0;
        const cast = character.cast ?? 0;
        // Normalize cast aim so remotes get a unit direction for arm IK.
        let cax = character.castAimX ?? 0;
        let cay = character.castAimY ?? 0;
        let caz = character.castAimZ ?? 1;
        const cl = Math.hypot(cax, cay, caz) || 1;
        cax /= cl;
        cay /= cl;
        caz /= cl;
        const payload = {
            x: character.position.x,
            y: character.position.y,
            z: character.position.z,
            yaw: character.facing ?? 0,
            pitch: look.pitch ?? 0,
            speed01,
            lean: character.lean ?? 0,
            grounded,
            surfing,
            surf,
            carve: character.carve ?? 0,
            gaitPhase: character.gaitPhase ?? 0,
            cast,
            castAimX: cax,
            castAimY: cay,
            castAimZ: caz,
            air: character.air ?? (grounded ? 0 : 1),
            velY: character.velY ?? 0,
            jumpKind,
            flipAngle: character.flipAngle ?? 0,
            flipTuck: character.flipTuck ?? 0,
            flipping,
            olliePhase,
            anim: inferAnim({
                speed01,
                grounded,
                surfing,
                flipping,
                jumpKind,
                olliePhase,
            }),
            seq: this.seq,
        };
        session.send(MSG_MOVE, payload);
    }

    /**
     * Soft-correct local character if server state for *us* diverges hard.
     * @param {import('../character/controller.js').CharacterController} character
     * @param {object} serverPlayer
     * @param {string} localSessionId
     */
    reconcileLocal(character, serverPlayer, localSessionId) {
        if (!serverPlayer || serverPlayer.sessionId !== localSessionId) return;
        if (typeof serverPlayer.seq === "number") {
            this.ackSeq = Math.max(this.ackSeq, serverPlayer.seq);
        }
        const dx = serverPlayer.x - character.position.x;
        const dz = serverPlayer.z - character.position.z;
        const dist = Math.hypot(dx, dz);
        // Only snap on severe desync (anti-cheat clamp on server side)
        if (dist > 4.5) {
            character.position.x = serverPlayer.x;
            character.position.z = serverPlayer.z;
            if (typeof serverPlayer.y === "number") character.position.y = serverPlayer.y;
            if (typeof serverPlayer.yaw === "number") character.facing = serverPlayer.yaw;
            console.warn(`[net] reconcile snap ${dist.toFixed(2)}m`);
        }
    }
}
