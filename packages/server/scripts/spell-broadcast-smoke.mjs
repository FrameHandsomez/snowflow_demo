/**
 * Headless 2-client spell broadcast smoke (no WebGPU).
 * Proves: client A MSG_SPELL → server → client B MSG_SPELL_EVENT.
 *
 * Usage (server already on :2567):
 *   node packages/server/scripts/spell-broadcast-smoke.mjs
 */
import { Client } from "colyseus.js";
import {
    PROTOCOL_VERSION,
    ROOM_NAME_ZONE,
    MSG_WELCOME,
    MSG_SPELL,
    MSG_SPELL_EVENT,
    MSG_MOVE,
} from "@snowflow/shared";

const ENDPOINT = process.env.COLYSEUS_URL || "ws://127.0.0.1:2567";

function waitMessage(room, type, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeoutMs);
        room.onMessage(type, (msg) => {
            clearTimeout(t);
            resolve(msg);
        });
    });
}

function once(room, type, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`timeout once ${type}`)), timeoutMs);
        const unbind = room.onMessage(type, (msg) => {
            clearTimeout(t);
            resolve(msg);
        });
        // colyseus onMessage returns void in some versions — rely on first fire only
        void unbind;
    });
}

async function join(name) {
    const client = new Client(ENDPOINT);
    const room = await client.joinOrCreate(ROOM_NAME_ZONE, {
        displayName: name,
        protocolVersion: PROTOCOL_VERSION,
    });
    const welcome = await waitMessage(room, MSG_WELCOME, 5000);
    return { client, room, welcome, sessionId: room.sessionId };
}

async function main() {
    console.log(`[smoke] endpoint ${ENDPOINT} protocol ${PROTOCOL_VERSION}`);
    const a = await join("caster-a");
    const b = await join("watcher-b");
    console.log(`[smoke] A=${a.sessionId} B=${b.sessionId}`);

    // Align poses so AOI always includes both (spawn cluster is already co-located).
    a.room.send(MSG_MOVE, {
        x: 8, y: 0, z: -6, yaw: 0, pitch: 0,
        anim: "idle", speed01: 0, lean: 0, grounded: true, surfing: false, seq: 1,
    });
    b.room.send(MSG_MOVE, {
        x: 8.5, y: 0, z: -6, yaw: 0, pitch: 0,
        anim: "idle", speed01: 0, lean: 0, grounded: true, surfing: false, seq: 1,
    });
    await new Promise((r) => setTimeout(r, 150));

    const recvPromise = once(b.room, MSG_SPELL_EVENT, 4000);

    const payload = {
        key: 1,
        phase: "cast",
        aimX: 0,
        aimY: 0,
        aimZ: 1,
        seq: 1,
    };
    console.log("[smoke] A send MSG_SPELL", payload);
    a.room.send(MSG_SPELL, payload);

    const event = await recvPromise;
    console.log("[smoke] B got MSG_SPELL_EVENT", {
        sessionId: event.sessionId,
        key: event.key,
        phase: event.phase,
        seq: event.seq,
        aimZ: event.aimZ,
    });

    const ok =
        event.sessionId === a.sessionId &&
        event.key === 1 &&
        event.phase === "cast" &&
        event.seq === 1;

    // Also try key 5 and key 3 with target
    const recv5 = once(b.room, MSG_SPELL_EVENT, 4000);
    a.room.send(MSG_SPELL, { key: 5, phase: "cast", aimX: 0, aimY: 0, aimZ: 1, seq: 2 });
    const e5 = await recv5;
    console.log("[smoke] B got key5", e5.key, e5.seq);

    const recv3 = once(b.room, MSG_SPELL_EVENT, 4000);
    a.room.send(MSG_SPELL, {
        key: 3,
        phase: "cast",
        aimX: 0,
        aimY: 0,
        aimZ: 1,
        targetX: 10,
        targetY: 0,
        targetZ: -6,
        seq: 3,
    });
    const e3 = await recv3;
    console.log("[smoke] B got key3", e3.key, e3.targetX, e3.seq);

    await a.room.leave();
    await b.room.leave();

    if (!ok || e5.key !== 5 || e3.key !== 3) {
        console.error("[smoke] FAIL");
        process.exit(1);
    }
    console.log("[smoke] PASS — spell broadcast A→server→B for keys 1,5,3");
    process.exit(0);
}

main().catch((err) => {
    console.error("[smoke] ERROR", err);
    process.exit(1);
});
