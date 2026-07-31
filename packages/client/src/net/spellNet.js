/** Visual spell events: local casts go to the room; remote casts play locally. */

import { MSG_SPELL, MSG_SPELL_EVENT, normalizeSpellEvent } from "@snowflow/shared";

export class SpellNet {
    /**
     * @param {object} opts
     * @param {() => ({ send(type:string, payload:object): void } | null)} opts.getSession
     * @param {() => string | null} opts.getSessionId
     * @param {(sessionId:string) => import('./remoteCharacter.js').RemoteCharacter | null} opts.getRemote
     */
    constructor(opts) {
        this.getSession = opts.getSession;
        this.getSessionId = opts.getSessionId;
        this.getRemote = opts.getRemote;
        this._seq = 0;
        this._seen = new Set();
    }

    /** @param {import('colyseus.js').Room} room */
    bindRoom(room) {
        room.onMessage(MSG_SPELL_EVENT, (raw) => {
            const event = normalizeSpellEvent(raw);
            if (!event || event.sessionId === this.getSessionId()) return;
            const key = `${event.sessionId}:${event.seq}`;
            if (this._seen.has(key)) return;
            this._seen.add(key);
            if (this._seen.size > 200) this._seen.delete(this._seen.values().next().value);
            this.getRemote(event.sessionId)?.playSpell(event);
        });
    }

    /** @param {object} event */
    emit(event) {
        const session = this.getSession();
        const sid = this.getSessionId();
        if (!session || !sid) return;
        this._seq += 1;
        session.send(MSG_SPELL, { ...event, seq: this._seq });
    }
}
