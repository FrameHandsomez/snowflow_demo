/**
 * Simple rebindable controls. Up to two codes per action, persisted in localStorage.
 *
 * Codes are KeyboardEvent.code values, or Mouse0 / Mouse1 / Mouse2 for buttons.
 * Slot 0 = primary, slot 1 = alternate (optional).
 */

const STORAGE_KEY = "snowflow.bindings.v2";
const LEGACY_KEY = "snowflow.bindings.v1";
const SLOT_COUNT = 2;

/** @typedef {keyof typeof DEFAULT_BINDINGS} ActionId */

/** Defaults: [primary, secondary]. Empty string = unused slot. */
export const DEFAULT_BINDINGS = {
    moveForward: ["KeyW", "ArrowUp"],
    moveBack: ["KeyS", "ArrowDown"],
    moveLeft: ["KeyA", "ArrowLeft"],
    moveRight: ["KeyD", "ArrowRight"],
    sprint: ["ShiftLeft", ""],
    jump: ["Space", ""],
    surf: ["Mouse2", ""],
    spell1: ["Digit1", ""],
    spell2: ["Digit2", ""],
    spell3: ["Digit3", ""],
    spell4: ["Digit4", ""],
    spell5: ["Digit5", ""],
    toggleOverlay: ["F1", "Backquote"],
};

/** Labels for the settings panel. */
export const ACTION_META = [
    { id: "moveForward", label: "Forward" },
    { id: "moveBack", label: "Back" },
    { id: "moveLeft", label: "Left" },
    { id: "moveRight", label: "Right" },
    { id: "sprint", label: "Sprint" },
    { id: "jump", label: "Jump" },
    { id: "surf", label: "Snow-surf" },
    { id: "spell1", label: "Spell 1" },
    { id: "spell2", label: "Spell 2 (hold)" },
    { id: "spell3", label: "Spell 3" },
    { id: "spell4", label: "Spell 4" },
    { id: "spell5", label: "Spell 5" },
    { id: "toggleOverlay", label: "Settings" },
];

/** @type {Record<string, [string, string]>} */
export const bindings = Object.create(null);

/** Reverse map: code → action id. Rebuilt on every change. */
/** @type {Record<string, string>} */
export let codeToAction = Object.create(null);

cloneDefaults();
loadBindings();

function emptyPair() {
    return /** @type {[string, string]} */ (["", ""]);
}

function cloneDefaults() {
    for (const id in DEFAULT_BINDINGS) {
        const d = DEFAULT_BINDINGS[id];
        bindings[id] = [d[0] || "", d[1] || ""];
    }
}

/**
 * @param {unknown} raw
 * @returns {[string, string]}
 */
function normalizePair(raw) {
    if (Array.isArray(raw)) {
        return [typeof raw[0] === "string" ? raw[0] : "", typeof raw[1] === "string" ? raw[1] : ""];
    }
    if (typeof raw === "string" && raw.length > 0) return [raw, ""];
    return emptyPair();
}

function rebuildIndex() {
    const next = Object.create(null);
    for (const id in bindings) {
        const pair = bindings[id];
        for (let s = 0; s < SLOT_COUNT; s++) {
            const code = pair[s];
            if (code) next[code] = id;
        }
    }
    // Either Shift counts as sprint when a Shift key is bound.
    const sprint = bindings.sprint;
    for (let s = 0; s < SLOT_COUNT; s++) {
        const c = sprint[s];
        if (c === "ShiftLeft") next.ShiftRight = "sprint";
        if (c === "ShiftRight") next.ShiftLeft = "sprint";
    }
    codeToAction = next;
}

/**
 * Human-readable label for a code.
 * @param {string} code
 */
export function formatCode(code) {
    if (!code) return "—";
    if (code === "Mouse0") return "LMB";
    if (code === "Mouse1") return "MMB";
    if (code === "Mouse2") return "RMB";
    if (code.startsWith("Key")) return code.slice(3);
    if (code.startsWith("Digit")) return code.slice(5);
    if (code === "ShiftLeft" || code === "ShiftRight") return "Shift";
    if (code === "ControlLeft" || code === "ControlRight") return "Ctrl";
    if (code === "AltLeft" || code === "AltRight") return "Alt";
    if (code === "Space") return "Space";
    if (code === "Backquote") return "`";
    if (code.startsWith("Arrow")) return code.slice(5);
    return code;
}

function loadBindings() {
    try {
        let raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            // Migrate single-slot v1 → two-slot v2 once.
            const legacy = localStorage.getItem(LEGACY_KEY);
            if (legacy) {
                const parsed = JSON.parse(legacy);
                if (parsed && typeof parsed === "object") {
                    for (const id in DEFAULT_BINDINGS) {
                        if (typeof parsed[id] === "string" && parsed[id]) {
                            bindings[id] = [parsed[id], ""];
                        }
                    }
                    rebuildIndex();
                    saveBindings();
                    try {
                        localStorage.removeItem(LEGACY_KEY);
                    } catch {
                        /* ignore */
                    }
                    return;
                }
            }
        } else {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object") {
                for (const id in DEFAULT_BINDINGS) {
                    if (id in parsed) bindings[id] = normalizePair(parsed[id]);
                }
                // Jump was added later. If an old save put Space on surf and jump
                // is empty, give Space to jump so the expected key still works.
                if (!("jump" in parsed)) {
                    const surf = bindings.surf;
                    for (let s = 0; s < SLOT_COUNT; s++) {
                        if (surf[s] === "Space") {
                            surf[s] = s === 0 ? "Mouse2" : "";
                            bindings.jump = ["Space", ""];
                            break;
                        }
                    }
                    if (!bindings.jump[0] && !bindings.jump[1]) {
                        bindings.jump = ["Space", ""];
                    }
                }
            }
        }
    } catch {
        // Ignore corrupt storage; defaults stay.
    }
    rebuildIndex();
}

function saveBindings() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
    } catch {
        // Private mode / quota — still usable for the session.
    }
}

/**
 * @param {string} actionId
 * @param {number} [slot]
 * @returns {string}
 */
export function getBinding(actionId, slot = 0) {
    const pair = bindings[actionId] || DEFAULT_BINDINGS[actionId];
    if (!pair) return "";
    return pair[slot] || "";
}

/**
 * Both slots for an action.
 * @param {string} actionId
 * @returns {[string, string]}
 */
export function getBindingPair(actionId) {
    const pair = bindings[actionId] || DEFAULT_BINDINGS[actionId] || emptyPair();
    return [pair[0] || "", pair[1] || ""];
}

/**
 * All codes bound to an action (non-empty).
 * @param {string} actionId
 * @returns {string[]}
 */
export function getBindingCodes(actionId) {
    const pair = bindings[actionId];
    if (!pair) return [];
    const out = [];
    for (let s = 0; s < SLOT_COUNT; s++) if (pair[s]) out.push(pair[s]);
    return out;
}

/**
 * Clear one slot (right-click / clear). Compacts so primary stays filled when possible.
 * @param {string} actionId
 * @param {number} slot
 */
export function clearBinding(actionId, slot) {
    if (!(actionId in DEFAULT_BINDINGS)) return false;
    if (slot !== 0 && slot !== 1) return false;
    const pair = bindings[actionId];
    pair[slot] = "";
    // Keep at least defaults? No — allow empty secondary; if both empty, restore primary default.
    if (!pair[0] && !pair[1]) {
        pair[0] = DEFAULT_BINDINGS[actionId][0] || "";
    } else if (!pair[0] && pair[1]) {
        pair[0] = pair[1];
        pair[1] = "";
    }
    rebuildIndex();
    saveBindings();
    return true;
}

/**
 * Assign a code to action+slot. If another action owns the code, clear that slot.
 * Same action other slot with same code → just clear the other slot (no dup).
 * @param {string} actionId
 * @param {string} code
 * @param {number} [slot]
 */
export function setBinding(actionId, code, slot = 0) {
    if (!(actionId in DEFAULT_BINDINGS)) return false;
    if (slot !== 0 && slot !== 1) return false;
    if (!code || typeof code !== "string") return false;

    // Block browser-chrome traps that are painful to recover from.
    if (code === "Tab" || code === "MetaLeft" || code === "MetaRight" || code === "Escape") {
        return false;
    }

    // Remove this code from every slot everywhere (including our other slot).
    for (const id in bindings) {
        const pair = bindings[id];
        for (let s = 0; s < SLOT_COUNT; s++) {
            if (pair[s] === code) pair[s] = "";
        }
    }

    bindings[actionId][slot] = code;

    // Compact empties for this action: prefer filled primary.
    const pair = bindings[actionId];
    if (!pair[0] && pair[1]) {
        pair[0] = pair[1];
        pair[1] = "";
        // If we wrote to slot 1 and primary was empty, code is now in slot 0 — fine.
    }

    rebuildIndex();
    saveBindings();
    return true;
}

/** Restore factory defaults. */
export function resetBindings() {
    cloneDefaults();
    rebuildIndex();
    saveBindings();
}
