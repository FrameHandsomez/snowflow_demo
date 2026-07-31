/**
 * Networked snow deform events (Phase 1).
 * Local contact system still stamps locally; we also emit events for peers.
 * Remote events apply the same brush parameters deterministically.
 */

import { MSG_DEFORM, MSG_DEFORM_EVENT, normalizeDeformEvent } from "@snowflow/shared";

export class DeformNet {
    /**
     * @param {object} opts
     * @param {import('../terrain/deformation.js').DeformationField | null} opts.field
     * @param {() => ({ send(type:string, payload:object): void } | null)} opts.getSession
     * @param {() => string | null} opts.getSessionId
     */
    constructor(opts) {
        this.field = opts.field;
        this.getSession = opts.getSession;
        this.getSessionId = opts.getSessionId;
        this._seq = 0;
        /** dedupe remote */
        this._seen = new Map();
    }

    /**
     * @param {import('colyseus.js').Room} room
     */
    bindRoom(room) {
        room.onMessage(MSG_DEFORM_EVENT, (raw) => {
            const ev = normalizeDeformEvent(raw);
            if (!ev) return;
            const local = this.getSessionId();
            if (ev.sessionId === local) return;
            const key = `${ev.sessionId}:${ev.seq}:${ev.kind}:${ev.x.toFixed(2)}:${ev.z.toFixed(2)}`;
            if (this._seen.has(key)) return;
            this._seen.set(key, Date.now());
            if (this._seen.size > 200) {
                const first = this._seen.keys().next().value;
                this._seen.delete(first);
            }
            this.applyLocal(ev);
        });
    }

    /**
     * Emit a deform event to the server (and keep local stamp responsibility on caller).
     * @param {Omit<import('@snowflow/shared').DeformEvent, 'sessionId'|'seq'> & { kind: string, x: number, z: number }} partial
     */
    emit(partial) {
        const session = this.getSession();
        const sid = this.getSessionId();
        if (!session || !sid) return;
        this._seq += 1;
        const payload = {
            kind: partial.kind,
            x: partial.x,
            z: partial.z,
            yaw: partial.yaw ?? 0,
            radius: partial.radius ?? 0.22,
            depth: partial.depth ?? 0.35,
            seq: this._seq,
            t: Date.now(),
        };
        session.send(MSG_DEFORM, payload);
    }

    /**
     * @param {import('@snowflow/shared').DeformEvent} ev
     */
    applyLocal(ev) {
        const field = this.field;
        if (!field || typeof field.brush !== "function") return;
        // Signature: x,z,radius,depth,berm,compression,ice,yaw,elongation,edge
        const impact = Math.max(0.2, Math.min(1.2, ev.depth));
        field.brush(
            ev.x,
            ev.z,
            ev.radius,
            0.17 + 0.14 * impact,
            0.10 + 0.08 * impact,
            0.9,
            0,
            ev.yaw || 0,
            1.35,
            1.0,
        );
    }

    /**
     * Helper: foot plant from local character (call on footfall frame).
     * @param {import('../character/controller.js').CharacterController} ch
     */
    onLocalFootfall(ch) {
        if (!ch?.footfall) return;
        this.emit({
            kind: "foot",
            x: ch.footPos.x,
            z: ch.footPos.z,
            yaw: ch.facing || 0,
            radius: 0.2,
            depth: 0.4 + (ch.speed01 || 0) * 0.25,
        });
    }
}
