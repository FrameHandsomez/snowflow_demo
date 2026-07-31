import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    createPlayerSnapshot,
    isValidPlayerPose,
    PLAYER_STATE_FIELDS,
} from "./player.js";

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
});
