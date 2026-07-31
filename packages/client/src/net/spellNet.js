/** Visual spell events: local casts go to the room; remote casts play full SpellSystem or proxy. */

import { MSG_SPELL, MSG_SPELL_EVENT, normalizeSpellEvent } from "@snowflow/shared";

/** @returns {boolean} */
function spellDebugEnabled() {
    try {
        if (typeof localStorage !== "undefined") {
            const v = localStorage.getItem("snowflow.mp.debug");
            if (v === "0" || v === "false") return false;
            if (v === "1" || v === "true") return true;
        }
        if (typeof location !== "undefined") {
            const q = new URLSearchParams(location.search);
            if (q.get("mpDebug") === "0") return false;
            if (q.get("mpDebug") === "1" || q.get("mp") === "1") return true;
        }
    } catch {
        /* ignore */
    }
    return true;
}

/** @param {...unknown} args */
function logSpell(...args) {
    if (!spellDebugEnabled()) return;
    console.info("[mp:spell]", ...args);
}

export class SpellNet {
    /**
     * @param {object} opts
     * @param {() => ({ send(type:string, payload:object): void } | null)} opts.getSession
     * @param {() => string | null} opts.getSessionId
     * @param {(sessionId:string) => import('./remoteCharacter.js').RemoteCharacter | null} opts.getRemote
     * @param {(
     *   event: object,
     *   origin: { x:number, y:number, z:number } | null
     * ) => boolean} [opts.playFull]
     *   Try full SpellSystem visual (no terrain). Return false → proxy fallback.
     */
    constructor(opts) {
        this.getSession = opts.getSession;
        this.getSessionId = opts.getSessionId;
        this.getRemote = opts.getRemote;
        this.playFull = opts.playFull || null;
        this._seq = 0;
        this._seen = new Set();
        /** @type {Map<string, object[]>} spell_event backlog until remote visual exists */
        this._pending = new Map();
        this._pendingMaxPerRemote = 8;
    }

    /** @param {import('colyseus.js').Room} room */
    bindRoom(room) {
        room.onMessage(MSG_SPELL_EVENT, (raw) => {
            const event = normalizeSpellEvent(raw);
            if (!event) {
                logSpell("recv drop (normalize failed)", raw);
                return;
            }
            if (event.sessionId === this.getSessionId()) {
                logSpell("recv skip self", event.key, event.phase, "seq", event.seq);
                return;
            }
            const key = `${event.sessionId}:${event.seq}`;
            if (this._seen.has(key)) {
                logSpell("recv dup", key);
                return;
            }
            this._seen.add(key);
            if (this._seen.size > 200) this._seen.delete(this._seen.values().next().value);

            this.#deliver(event);
        });
        logSpell("bound MSG_SPELL_EVENT on room");
    }

    /**
     * @param {object} event
     */
    #deliver(event) {
        const remote = this.getRemote(event.sessionId);
        const origin = remote?.puppet?.position
            ? {
                x: remote.puppet.position.x,
                y: remote.puppet.position.y,
                z: remote.puppet.position.z,
            }
            : null;

        // Prefer full SpellSystem (water/ice/lights/spray) with terrain writes off.
        if (typeof this.playFull === "function") {
            try {
                const ok = this.playFull(event, origin);
                if (ok) {
                    // Still nudge remote cast pose / proxy idle so body aims correctly.
                    remote?.noteSpell?.(event);
                    logSpell(
                        "recv full",
                        "sid",
                        event.sessionId,
                        "key",
                        event.key,
                        "phase",
                        event.phase,
                        "seq",
                        event.seq,
                    );
                    return;
                }
                logSpell("recv full denied (cap/fail) → proxy", event.key, event.seq);
            } catch (err) {
                console.warn("[mp:spell] playFull error → proxy", err);
            }
        }

        if (!remote) {
            this.#queue(event);
            logSpell(
                "recv queued (no remote yet)",
                "sid",
                event.sessionId,
                "key",
                event.key,
                "seq",
                event.seq,
            );
            return;
        }
        remote.playSpell(event);
        logSpell(
            "recv proxy",
            "sid",
            event.sessionId,
            "key",
            event.key,
            "phase",
            event.phase,
            "seq",
            event.seq,
        );
    }

    /** @param {object} event */
    emit(event) {
        const session = this.getSession();
        const sid = this.getSessionId();
        if (!session || !sid) {
            logSpell("emit skip (no session)", event?.key, event?.phase);
            return;
        }
        if (typeof session.send !== "function") {
            logSpell("emit skip (session.send missing — check getSession wiring)");
            return;
        }
        this._seq += 1;
        const payload = { ...event, seq: this._seq };
        session.send(MSG_SPELL, payload);
        logSpell("emit → server", "key", payload.key, "phase", payload.phase, "seq", payload.seq);
    }

    /**
     * Flush queued spell_events once a remote visual is created.
     * @param {string} sessionId
     */
    flush(sessionId) {
        const list = this._pending.get(sessionId);
        if (!list?.length) return;
        if (!this.getRemote(sessionId) && typeof this.playFull !== "function") return;
        this._pending.delete(sessionId);
        for (const event of list) {
            this.#deliver(event);
            logSpell("flush deliver", "sid", sessionId, "key", event.key, "seq", event.seq);
        }
    }

    /** @param {object} event */
    #queue(event) {
        const sid = event.sessionId;
        let list = this._pending.get(sid);
        if (!list) {
            list = [];
            this._pending.set(sid, list);
        }
        list.push(event);
        while (list.length > this._pendingMaxPerRemote) list.shift();
    }
}
