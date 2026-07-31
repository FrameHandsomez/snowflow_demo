/**
 * Headless AOI enter/leave smoke (no WebGPU).
 *
 *   node packages/server/scripts/aoi-interest-smoke.mjs
 */
import { Client } from "colyseus.js";
import {
    PROTOCOL_VERSION,
    ROOM_NAME_ZONE,
    MSG_WELCOME,
    MSG_MOVE,
    MSG_STATE,
    MSG_PLAYER_JOINED,
    MSG_INTEREST_LEFT,
    AOI_CELL_SIZE_M,
    MAX_MOVE_STEP_M,
} from "@snowflow/shared";

const ENDPOINT = process.env.COLYSEUS_URL || "ws://127.0.0.1:2567";
/** Stay under server step/speed clamps. */
const STEP = Math.min(5, MAX_MOVE_STEP_M - 0.5);
const STEP_MS = 200;

function waitMessage(room, type, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeoutMs);
        room.onMessage(type, (msg) => {
            clearTimeout(t);
            resolve(msg);
        });
    });
}

function sendMove(room, seq, x, z) {
    room.send(MSG_MOVE, {
        x,
        y: 0,
        z,
        yaw: 0,
        pitch: 0,
        anim: "run",
        speed01: 0.5,
        lean: 0,
        grounded: true,
        surfing: false,
        air: 0,
        velY: 0,
        jumpKind: 0,
        flipAngle: 0,
        flipTuck: 0,
        flipping: false,
        olliePhase: 0,
        seq,
    });
}

function armCollector(room, type, pred) {
    /** @type {object[]} */
    const bag = [];
    room.onMessage(type, (msg) => {
        if (!pred || pred(msg)) bag.push(msg);
    });
    return {
        bag,
        wait(timeoutMs = 15000) {
            return new Promise((resolve, reject) => {
                const start = Date.now();
                const tick = () => {
                    if (bag.length) return resolve(bag[bag.length - 1]);
                    if (Date.now() - start > timeoutMs) {
                        return reject(new Error(`timeout ${type} (got ${bag.length})`));
                    }
                    setTimeout(tick, 25);
                };
                tick();
            });
        },
        clear() {
            bag.length = 0;
        },
    };
}

async function join(name) {
    const client = new Client(ENDPOINT);
    const room = await client.joinOrCreate(ROOM_NAME_ZONE, {
        displayName: name,
        protocolVersion: PROTOCOL_VERSION,
    });
    // Register swallow handlers immediately so join traffic does not warn.
    for (const t of [MSG_STATE, MSG_PLAYER_JOINED, MSG_INTEREST_LEFT]) {
        room.onMessage(t, () => {});
    }
    const welcome = await waitMessage(room, MSG_WELCOME, 5000);
    return { client, room, welcome, sessionId: room.sessionId };
}

/** Walk room toward targetX in legal steps; returns final x and next seq. */
async function walkTo(room, startX, targetX, startSeq, z = -6) {
    let x = startX;
    let seq = startSeq;
    const dir = targetX >= startX ? 1 : -1;
    while ((dir > 0 && x < targetX) || (dir < 0 && x > targetX)) {
        x = dir > 0 ? Math.min(targetX, x + STEP) : Math.max(targetX, x - STEP);
        sendMove(room, seq++, x, z);
        await new Promise((r) => setTimeout(r, STEP_MS));
    }
    return { x, seq };
}

async function main() {
    console.log(
        `[aoi-smoke] endpoint ${ENDPOINT} protocol ${PROTOCOL_VERSION} cell=${AOI_CELL_SIZE_M} step=${STEP}`,
    );
    const a = await join("aoi-a");
    const b = await join("aoi-b");
    console.log(`[aoi-smoke] A=${a.sessionId} B=${b.sessionId}`);
    await new Promise((r) => setTimeout(r, 400));

    // Re-bind collectors on A (join() installed no-op swallowers first).
    const leftCol = armCollector(
        a.room,
        MSG_INTEREST_LEFT,
        (msg) => msg?.sessionId === b.sessionId,
    );
    const joinCol = armCollector(
        a.room,
        MSG_PLAYER_JOINED,
        (msg) => (msg?.sessionId || msg?.player?.sessionId) === b.sessionId,
    );
    let stateFromB = 0;
    a.room.onMessage(MSG_STATE, (msg) => {
        const list = msg?.players;
        if (Array.isArray(list) && list.some((p) => p?.sessionId === b.sessionId)) {
            stateFromB += 1;
        }
    });

    // Co-locate near spawn.
    sendMove(a.room, 1, 8, -6);
    await new Promise((r) => setTimeout(r, 150));
    let bx = 10;
    let bseq = 1;
    sendMove(b.room, bseq++, bx, -6);
    await new Promise((r) => setTimeout(r, 300));
    const nearCount = stateFromB;

    // Far enough to leave A's Chebyshev r=1 (need ≥2 cells → ~128m+).
    const farX = 8 + AOI_CELL_SIZE_M * 2.5;
    ({ x: bx, seq: bseq } = await walkTo(b.room, bx, farX, bseq));

    const left = await leftCol.wait(20000);
    console.log("[aoi-smoke] A got INTEREST_LEFT", left.sessionId, left.reason);

    const afterLeave = stateFromB;
    ({ x: bx, seq: bseq } = await walkTo(b.room, bx, farX + 8, bseq));
    await new Promise((r) => setTimeout(r, 200));
    const leaked = stateFromB - afterLeave;
    console.log(`[aoi-smoke] B-state msgs near≈${nearCount} leaked_while_far=${leaked}`);

    // Return — keep bx in sync so steps stay legal.
    joinCol.clear();
    ({ x: bx, seq: bseq } = await walkTo(b.room, bx, 12, bseq));
    const rejoin = await joinCol.wait(20000);
    console.log(
        "[aoi-smoke] A got PLAYER_JOINED re-enter",
        rejoin?.sessionId || rejoin?.player?.sessionId,
        rejoin?.reason,
    );

    await a.room.leave();
    await b.room.leave();

    if (leaked > 3) {
        console.error(`[aoi-smoke] FAIL leaked B state while far count=${leaked}`);
        process.exit(1);
    }
    console.log("[aoi-smoke] PASS — interest leave + re-enter");
    process.exit(0);
}

main().catch((err) => {
    console.error("[aoi-smoke] ERROR", err);
    process.exit(1);
});
