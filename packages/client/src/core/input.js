/**
 * Raw input state. Everything lands in one mutable struct that systems poll —
 * no events fired into game code, no per-frame allocation.
 *
 * Mouse look uses pointer lock, which frees mouse buttons for actions.
 * Actions are resolved through `bindings` (up to two codes each).
 */

import { codeToAction, getBindingCodes } from "./bindings.js";

export const input = {
    // Movement axes, camera-relative, already normalised to a unit disc.
    moveX: 0,
    moveZ: 0,
    moving: false,

    // Accumulated mouse delta since last `endFrame()`, in radians.
    lookX: 0,
    lookY: 0,

    // Zoom, consumed by the camera rig.
    zoomDelta: 0,

    surf: false,
    sprint: false,
    /** Edge-triggered: true for one frame after jump is pressed. */
    jumpPressed: false,
    /** Held while the jump binding is down (variable jump cut). */
    jump: false,

    /** @type {number} 0 = none, else 1..5 — set on keydown, cleared each frame */
    spellPressed: 0,
    /** @type {boolean} spell 2 (Ribbon) is a held cast */
    spellHeld2: false,

    locked: false,
};

const keys = Object.create(null);
/** Mouse button held state, keyed by Mouse0/1/2. */
const mouseButtons = Object.create(null);
/** Previous-frame jump held — edge detection lives in poll, not keydown. */
let jumpWasDown = false;

const LOOK_SCALE = 0.0022;

/** @type {(() => void)|null} */
let onToggleOverlay = null;

/**
 * While listening for a rebind, game actions are paused so the next key is
 * captured by the overlay instead of casting a spell.
 * @type {boolean}
 */
export let rebindCapture = false;

/** @param {boolean} on */
export function setRebindCapture(on) {
    rebindCapture = !!on;
    if (on) clearHeld();
}

function clearHeld() {
    for (const k in keys) keys[k] = false;
    for (const k in mouseButtons) mouseButtons[k] = false;
    input.surf = false;
    input.spellHeld2 = false;
    input.sprint = false;
    input.jump = false;
    input.jumpPressed = false;
    jumpWasDown = false;
}

/**
 * @param {string} code
 * @returns {boolean}
 */
function codeDown(code) {
    if (!code) return false;
    if (code.startsWith("Mouse")) return !!mouseButtons[code];
    if (keys[code]) return true;
    if (code === "ShiftLeft" && keys.ShiftRight) return true;
    if (code === "ShiftRight" && keys.ShiftLeft) return true;
    return false;
}

/**
 * @param {string} actionId
 * @returns {boolean}
 */
function actionDown(actionId) {
    const codes = getBindingCodes(actionId);
    for (let i = 0; i < codes.length; i++) {
        if (codeDown(codes[i])) return true;
    }
    return false;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ onToggleOverlay?: () => void }} [hooks]
 */
export function initInput(canvas, hooks) {
    onToggleOverlay = hooks?.onToggleOverlay ?? null;

    canvas.addEventListener("click", () => {
        if (!input.locked) canvas.requestPointerLock();
    });

    document.addEventListener("pointerlockchange", () => {
        input.locked = document.pointerLockElement === canvas;
        if (!input.locked) clearHeld();
    });

    document.addEventListener("mousemove", (e) => {
        if (!input.locked) return;
        input.lookX += e.movementX * LOOK_SCALE;
        input.lookY += e.movementY * LOOK_SCALE;
    });

    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    document.addEventListener("mousedown", (e) => {
        const code = "Mouse" + e.button;
        mouseButtons[code] = true;

        if (rebindCapture) return;
        if (!input.locked) return;

        applyPress(code);
    });

    document.addEventListener("mouseup", (e) => {
        const code = "Mouse" + e.button;
        mouseButtons[code] = false;
        applyRelease(code);
    });

    document.addEventListener(
        "wheel",
        (e) => {
            if (!input.locked) return;
            e.preventDefault();
            input.zoomDelta += e.deltaY * 0.0016;
        },
        { passive: false }
    );

    window.addEventListener("keydown", (e) => {
        if (rebindCapture) return;

        const action = codeToAction[e.code];
        if (action === "toggleOverlay") {
            e.preventDefault();
            onToggleOverlay?.();
            return;
        }

        if (e.repeat) return;
        keys[e.code] = true;
        applyPress(e.code);
    });

    window.addEventListener("keyup", (e) => {
        keys[e.code] = false;
        applyRelease(e.code);
    });

    window.addEventListener("blur", () => {
        clearHeld();
    });
}

/** @param {string} code */
function applyPress(code) {
    const action = codeToAction[code];
    if (!action) return;
    if (action === "surf") input.surf = true;
    // Jump edge is detected in pollInput from held state so a stuck
    // keydown/repeat path cannot re-fire jumpPressed every frame.
    if (action === "jump") input.jump = true;
    if (action.startsWith("spell")) {
        const n = Number(action.slice(5));
        input.spellPressed = n;
        if (n === 2) input.spellHeld2 = true;
    }
}

/** @param {string} code */
function applyRelease(code) {
    const action = codeToAction[code];
    if (!action) return;
    // Only clear hold state if no other bound code for that action is still down.
    if (action === "surf" && !actionDown("surf")) input.surf = false;
    if (action === "jump" && !actionDown("jump")) input.jump = false;
    if (action === "spell2" && !actionDown("spell2")) input.spellHeld2 = false;
}

/** Resolve held keys into movement axes. Called once per frame before update. */
export function pollInput() {
    if (rebindCapture) {
        input.moveX = 0;
        input.moveZ = 0;
        input.moving = false;
        input.sprint = false;
        input.surf = false;
        input.jump = false;
        input.jumpPressed = false;
        jumpWasDown = false;
        return;
    }

    let x = 0;
    let z = 0;
    if (actionDown("moveForward")) z += 1;
    if (actionDown("moveBack")) z -= 1;
    if (actionDown("moveRight")) x += 1;
    if (actionDown("moveLeft")) x -= 1;

    // Clamp to a unit disc so diagonals aren't faster.
    const len = Math.sqrt(x * x + z * z);
    if (len > 1) {
        x /= len;
        z /= len;
    }
    input.moveX = x;
    input.moveZ = z;
    input.moving = len > 0.001;
    input.sprint = actionDown("sprint");
    input.surf = actionDown("surf");
    input.spellHeld2 = actionDown("spell2");

    // Jump: rising-edge only. Held Space must not re-assert jumpPressed.
    const jumpDown = actionDown("jump");
    input.jump = jumpDown;
    input.jumpPressed = jumpDown && !jumpWasDown;
    jumpWasDown = jumpDown;
}

/** Clear per-frame accumulators. Called at the very end of the frame. */
export function endFrame() {
    input.lookX = 0;
    input.lookY = 0;
    input.zoomDelta = 0;
    input.spellPressed = 0;
    // jumpPressed is one-shot from poll; clear so nothing late in the frame
    // can see a stale edge (and so the next poll owns the next edge).
    input.jumpPressed = false;
}

export function isDown(code) {
    return codeDown(code);
}
