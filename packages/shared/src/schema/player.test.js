import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    createPlayerSnapshot,
    isValidPlayerPose,
    PLAYER_STATE_FIELDS,
    inferAnim,
    applyMove,
} from "./player.js";
import { inAoi, cellOf, diffInterest } from "../aoi.js";
import { normalizeDeformEvent } from "./deform.js";
import { normalizeSpellEvent } from "./spell.js";
import { PROTOCOL_VERSION } from "../protocol.js";

describe("PlayerState contract", () => {
    it("creates a full snapshot with sessionId", () => {
        const p = createPlayerSnapshot("abc");
        assert.equal(p.sessionId, "abc");
        assert.equal(p.anim, "idle");
        for (const f of PLAYER_STATE_FIELDS) {
            assert.ok(f in p, `missing field ${f}`);
        }
    });

    it("rejects non-finite pose", () => {
        assert.equal(isValidPlayerPose({ x: 1, y: 2, z: 3, yaw: 0 }), true);
        assert.equal(isValidPlayerPose({ x: NaN, y: 0, z: 0, yaw: 0 }), false);
        assert.equal(isValidPlayerPose(null), false);
    });

    it("infers anim from flags", () => {
        assert.equal(inferAnim({ surfing: true }), "surf");
        assert.equal(inferAnim({ grounded: false, speed01: 0 }), "jump");
        assert.equal(inferAnim({ grounded: true, speed01: 0.8 }), "run");
        assert.equal(inferAnim({ grounded: true, speed01: 0.2 }), "walk");
    });

    it("applyMove updates pose + seq", () => {
        const p = createPlayerSnapshot("a");
        applyMove(p, { x: 3, z: -1, yaw: 1.2, speed01: 0.4, seq: 9, surfing: true });
        assert.equal(p.x, 3);
        assert.equal(p.z, -1);
        assert.equal(p.seq, 9);
        assert.equal(p.anim, "surf");
    });
});

describe("AOI", () => {
    it("cellOf floors world into grid", () => {
        const c = cellOf(65, -10, 64);
        assert.equal(c.cx, 1);
        assert.equal(c.cz, -1);
    });

    it("inAoi keeps nearby, drops far", () => {
        assert.equal(inAoi(0, 0, 30, 30, 1, 64), true);
        assert.equal(inAoi(0, 0, 200, 0, 1, 64), false);
    });

    it("diffInterest reports enter and leave", () => {
        const d = diffInterest(["a", "b"], ["b", "c"]);
        assert.deepEqual(d.entered.sort(), ["c"]);
        assert.deepEqual(d.left.sort(), ["a"]);
    });
});

describe("DeformEvent", () => {
    it("normalizes valid foot event", () => {
        const e = normalizeDeformEvent({
            sessionId: "s1",
            kind: "foot",
            x: 1,
            z: 2,
            yaw: 0.5,
            radius: 0.3,
            depth: 0.5,
        });
        assert.ok(e);
        assert.equal(e.kind, "foot");
        assert.equal(e.x, 1);
    });

    it("rejects bad kind", () => {
        assert.equal(
            normalizeDeformEvent({ sessionId: "s", kind: "laser", x: 0, z: 0 }),
            null,
        );
    });
});

describe("SpellEvent", () => {
    it("normalizes a visual cast event", () => {
        const event = normalizeSpellEvent({
            sessionId: "s1",
            seq: 4,
            key: 3,
            phase: "cast",
            aimX: 0,
            aimY: 0,
            aimZ: 1,
            targetX: 2,
            targetY: 0,
            targetZ: 4,
        });
        assert.ok(event);
        assert.equal(event.key, 3);
        assert.equal(event.targetZ, 4);
    });

    it("rejects targeted casts without a target", () => {
        assert.equal(
            normalizeSpellEvent({
                sessionId: "s1", seq: 1, key: 3, phase: "cast", aimX: 0, aimY: 0, aimZ: 1,
            }),
            null,
        );
    });
});

describe("protocol", () => {
    it("is Phase 1 minor version", () => {
        assert.match(PROTOCOL_VERSION, /^0\.3\./);
    });
});
