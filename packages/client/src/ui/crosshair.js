/**
 * Valorant-style crosshair: centre dot + inner/outer lines + outline, colour.
 *
 * Import accepts vcrdb / in-game share strings. Manual sliders in F1 → HUD
 * override live; colour is free (presets + hex picker).
 *
 * Default visual matches a clean white reticle (builder-like), not a single CSS
 * plus. Small Dot and other codes still import via `applyCode`.
 */

import { S, set, onChange } from "../core/settings.js";

const STORAGE_KEY = "snowflow.crosshair.v2";
export const DEFAULT_CROSSHAIR_CODE = "0;P;d;1;f;0;0t;4;0l;1;0o;0;0a;1;0f;0;1b;0";

/** CSS px per Valorant “unit” — tuned so thickness 2 ≈ a real in-game arm. */
const UNIT = 1.15;

/**
 * @typedef {object} CrosshairProfile
 * @property {string} color
 * @property {boolean} outlines
 * @property {number} outlineOpacity
 * @property {number} outlineThickness
 * @property {boolean} centerDot
 * @property {number} centerDotOpacity
 * @property {number} centerDotThickness
 * @property {boolean} inner
 * @property {number} innerOpacity
 * @property {number} innerLength
 * @property {number} innerThickness
 * @property {number} innerOffset
 * @property {boolean} outer
 * @property {number} outerOpacity
 * @property {number} outerLength
 * @property {number} outerThickness
 * @property {number} outerOffset
 * @property {string} code
 */

/** Builder-like white cross (from Frame’s screenshot). */
export const DEFAULT_PROFILE = /** @type {CrosshairProfile} */ ({
    color: "#FFFFFF",
    outlines: true,
    outlineOpacity: 0.5,
    outlineThickness: 1,
    centerDot: true,
    centerDotOpacity: 1,
    centerDotThickness: 2,
    inner: true,
    innerOpacity: 0.8,
    innerLength: 5,
    innerThickness: 2,
    innerOffset: 3,
    outer: true,
    outerOpacity: 0.35,
    outerLength: 2,
    outerThickness: 2,
    outerOffset: 10,
    code: DEFAULT_CROSSHAIR_CODE,
});

export const COLOR_PRESETS = [
    { id: "white", hex: "#FFFFFF", label: "White" },
    { id: "green", hex: "#00FF00", label: "Green" },
    { id: "cyan", hex: "#00FFFF", label: "Cyan" },
    { id: "red", hex: "#FF4655", label: "Red" },
    { id: "yellow", hex: "#F8F247", label: "Yellow" },
    { id: "pink", hex: "#FF63FF", label: "Pink" },
    { id: "purple", hex: "#B84DFF", label: "Purple" },
    { id: "orange", hex: "#FF9A3C", label: "Orange" },
    { id: "blue", hex: "#2EBAED", label: "Blue" },
    { id: "black", hex: "#1A1A1A", label: "Black" },
];

/**
 * @param {string} raw
 * @returns {string}
 */
export function normalizeCrosshairCode(raw) {
    if (!raw || typeof raw !== "string") return "";
    let s = raw.trim();
    if (
        (s.startsWith('"') && s.endsWith('"')) ||
        (s.startsWith("'") && s.endsWith("'")) ||
        (s.startsWith("`") && s.endsWith("`"))
    ) {
        s = s.slice(1, -1).trim();
    }
    if (s.indexOf(";") > 0 && !/^\d/.test(s)) {
        const m = s.match(/\d\s*;\s*P?[\s\S]*/i);
        if (m) s = m[0].trim();
    }
    return s.replace(/\s*;\s*/g, ";").replace(/\s+/g, "");
}

/**
 * @param {string} code
 */
export function isLikelyCrosshairCode(code) {
    const s = normalizeCrosshairCode(code);
    if (!s || s.length < 5) return false;
    if (s.split(";").length < 3) return false;
    return /^\d/.test(s) || /^P;/i.test(s);
}

/**
 * @param {string} hex
 * @returns {string}
 */
export function normalizeHex(hex) {
    if (!hex || typeof hex !== "string") return "#FFFFFF";
    let h = hex.trim();
    if (h[0] !== "#") h = "#" + h;
    if (/^#[0-9a-fA-F]{3}$/.test(h)) {
        h = "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(h)) return "#FFFFFF";
    return h.toUpperCase();
}

/**
 * Parse a Valorant/CS share string into a profile. Unknown keys ignored.
 * @param {string} code
 * @param {CrosshairProfile} [base]
 * @returns {CrosshairProfile}
 */
export function profileFromCode(code, base = DEFAULT_PROFILE) {
    /** @type {CrosshairProfile} */
    const p = { ...base, code: normalizeCrosshairCode(code) || base.code };
    const cleaned = p.code;
    if (!cleaned) return p;

    const parts = cleaned.split(";").filter((x) => x.length > 0);
    let i = 0;
    if (parts[i] && !Number.isNaN(Number(parts[i]))) i += 1;
    if (parts[i] && /^P$/i.test(parts[i])) i += 1;

    /** @type {Record<string, number|string>} */
    const kv = Object.create(null);
    while (i + 1 < parts.length) {
        kv[parts[i]] = Number.isNaN(Number(parts[i + 1]))
            ? parts[i + 1]
            : Number(parts[i + 1]);
        i += 2;
    }

    const n = (k, fallback) => {
        const v = kv[k];
        return typeof v === "number" ? v : fallback;
    };
    const on = (k, fallback) => {
        const v = kv[k];
        if (v === undefined) return fallback;
        return !!Number(v);
    };

    // Colour: c = palette index, u = custom packed / hex.
    if (kv.c !== undefined) {
        const map = {
            0: "#ED2E2E",
            1: "#00FF00",
            2: "#F8F247",
            3: "#2EBAED",
            4: "#E8C2FF",
            5: "#00FF00",
            6: "#FFFFFF",
            7: "#1A1A1A",
            8: "#FF63FF",
        };
        p.color = map[String(kv.c)] || p.color;
    }
    if (kv.u !== undefined) {
        const custom = decodeCustomColor(String(kv.u));
        if (custom) p.color = custom;
    }

    // Centre dot
    if (kv.d !== undefined) p.centerDot = on("d", p.centerDot);
    // Opacity / thickness — Valorant short codes are sparse; map what we have.
    if (kv["0t"] !== undefined) {
        // Common: 0t = inner thickness; also used as general weight on short codes.
        p.innerThickness = n("0t", p.innerThickness);
        p.centerDotThickness = Math.max(1, Math.round(n("0t", p.centerDotThickness) * 0.5));
    }
    if (kv.t !== undefined) p.innerThickness = n("t", p.innerThickness);

    if (kv["0l"] !== undefined) p.innerLength = n("0l", p.innerLength);
    if (kv["0o"] !== undefined) p.innerOffset = n("0o", p.innerOffset);
    if (kv["0a"] !== undefined) {
        const a = n("0a", 1);
        // 0..1 opacity, or 0/1 flag in short generators.
        if (a > 0 && a <= 1) {
            p.innerOpacity = a;
            p.centerDotOpacity = a;
        } else if (a === 0) {
            p.inner = false;
        }
    }
    if (kv.a !== undefined) {
        const a = n("a", p.innerOpacity);
        if (a >= 0 && a <= 1) p.innerOpacity = a;
    }

    // Outline
    if (kv.o !== undefined) p.outlines = on("o", p.outlines);
    if (kv.b !== undefined) {
        const b = n("b", 0);
        if (b > 0 && b <= 1) {
            p.outlines = true;
            p.outlineOpacity = b;
        } else p.outlines = !!b;
    }

    // Outer lines
    if (kv["1b"] !== undefined) p.outer = on("1b", p.outer);
    if (kv["1t"] !== undefined) p.outerThickness = n("1t", p.outerThickness);
    if (kv["1l"] !== undefined) p.outerLength = n("1l", p.outerLength);
    if (kv["1o"] !== undefined) p.outerOffset = n("1o", p.outerOffset);
    if (kv["1a"] !== undefined) {
        const a = n("1a", p.outerOpacity);
        if (a >= 0 && a <= 1) p.outerOpacity = a;
    }

    // Short “Small Dot” family: d=1, tiny length, outer off → emphasise the pip.
    if (p.centerDot && p.innerLength <= 1 && !p.outer) {
        p.inner = p.innerLength > 0;
        p.innerLength = Math.max(p.innerLength, 0);
        p.centerDotThickness = Math.max(p.centerDotThickness, 2);
        p.innerOffset = Math.min(p.innerOffset, 1);
        // Small Dot on vcrdb is a white bead with hairline outline.
        if (!kv.c && !kv.u) p.color = "#FFFFFF";
        p.outlines = true;
        p.outlineOpacity = 0.85;
        p.outlineThickness = 1;
    }

    // If length is 0 and no outer, hide inner arms (pure dot).
    if (p.innerLength <= 0) p.inner = false;

    return p;
}

/**
 * @param {string} raw
 * @returns {string}
 */
function decodeCustomColor(raw) {
    if (!raw) return "";
    if (/^#?[0-9a-fA-F]{6}$/.test(raw)) {
        return normalizeHex(raw);
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return "";
    const v = n >>> 0;
    const r = (v >> 16) & 255;
    const g = (v >> 8) & 255;
    const b = v & 255;
    return normalizeHex(
        "#" +
            r.toString(16).padStart(2, "0") +
            g.toString(16).padStart(2, "0") +
            b.toString(16).padStart(2, "0")
    );
}

/**
 * @returns {CrosshairProfile}
 */
function loadProfile() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object") {
                return sanitizeProfile({ ...DEFAULT_PROFILE, ...parsed });
            }
        }
    } catch {
        /* ignore */
    }
    return { ...DEFAULT_PROFILE };
}

/**
 * @param {CrosshairProfile} p
 */
function saveProfile(p) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch {
        /* ignore */
    }
}

/**
 * @param {CrosshairProfile} p
 * @returns {CrosshairProfile}
 */
export function sanitizeProfile(p) {
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || 0));
    return {
        color: normalizeHex(p.color),
        outlines: !!p.outlines,
        outlineOpacity: clamp(p.outlineOpacity, 0, 1),
        outlineThickness: clamp(p.outlineThickness, 0, 6),
        centerDot: !!p.centerDot,
        centerDotOpacity: clamp(p.centerDotOpacity, 0, 1),
        centerDotThickness: clamp(p.centerDotThickness, 0, 10),
        inner: !!p.inner,
        innerOpacity: clamp(p.innerOpacity, 0, 1),
        innerLength: clamp(p.innerLength, 0, 20),
        innerThickness: clamp(p.innerThickness, 0, 10),
        innerOffset: clamp(p.innerOffset, 0, 20),
        outer: !!p.outer,
        outerOpacity: clamp(p.outerOpacity, 0, 1),
        outerLength: clamp(p.outerLength, 0, 20),
        outerThickness: clamp(p.outerThickness, 0, 10),
        outerOffset: clamp(p.outerOffset, 0, 40),
        code: typeof p.code === "string" ? p.code : DEFAULT_CROSSHAIR_CODE,
    };
}

/**
 * @param {string} hex
 * @param {number} alpha
 */
function rgba(hex, alpha) {
    const h = normalizeHex(hex).slice(1);
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

export class Crosshair {
    /**
     * @param {string} [code]
     */
    constructor(code) {
        this.profile = loadProfile();
        // First boot with no save: honour settings default code if present.
        if (!localStorage.getItem(STORAGE_KEY) && (code || S.crosshairCode)) {
            const fromCode = profileFromCode(code || S.crosshairCode, DEFAULT_PROFILE);
            // Keep builder-quality defaults when code is the stock Small Dot —
            // pure code parse under-specifies and looked wrong.
            if (normalizeCrosshairCode(code || S.crosshairCode) === DEFAULT_CROSSHAIR_CODE) {
                this.profile = {
                    ...DEFAULT_PROFILE,
                    code: DEFAULT_CROSSHAIR_CODE,
                    // Small Dot lean: shorter arms, stronger centre.
                    innerLength: 2,
                    innerThickness: 2,
                    innerOffset: 1,
                    innerOpacity: 1,
                    outer: false,
                    centerDot: true,
                    centerDotThickness: 2,
                    centerDotOpacity: 1,
                    color: "#FFFFFF",
                    outlines: true,
                    outlineOpacity: 0.7,
                    outlineThickness: 1,
                };
            } else {
                this.profile = fromCode;
            }
        }

        this._buildDom();
        this.render();
        this._syncVisible();

        if (S.crosshairCode !== this.profile.code) {
            set("crosshairCode", this.profile.code);
        }

        onChange(["showCrosshair", "crosshairCode"], (v, k) => {
            if (k === "crosshairCode" && typeof v === "string" && v !== this.profile.code) {
                this.applyCode(v);
            }
            this._syncVisible();
        });
    }

    _buildDom() {
        const style = document.createElement("style");
        style.textContent = `
#xhair {
  position: fixed; inset: 0; z-index: 40;
  pointer-events: none; display: none;
}
#xhair.on { display: block; }
#xhair .xh-layer {
  position: absolute; left: 50%; top: 50%;
  width: 0; height: 0;
}
#xhair .xh-piece {
  position: absolute; left: 0; top: 0;
  box-sizing: border-box;
  transform: translate(-50%, -50%);
  background: var(--c, #fff);
  opacity: var(--a, 1);
}
#xhair .xh-piece.outline {
  background: transparent;
  box-shadow: 0 0 0 var(--ot, 1px) rgba(0,0,0,var(--oa, 0.5));
}
#xhair .xh-dot {
  border-radius: 1px;
}
`;
        document.head.appendChild(style);

        const root = document.createElement("div");
        root.id = "xhair";
        root.innerHTML = `
<div class="xh-layer" data-layer="outline"></div>
<div class="xh-layer" data-layer="fill"></div>
`;
        document.body.appendChild(root);
        this.el = root;
        this.outlineLayer = /** @type {HTMLElement} */ (root.querySelector('[data-layer="outline"]'));
        this.fillLayer = /** @type {HTMLElement} */ (root.querySelector('[data-layer="fill"]'));
    }

    _syncVisible() {
        this.el.classList.toggle("on", !!S.showCrosshair);
    }

    /**
     * @param {Partial<CrosshairProfile>} patch
     */
    setProfile(patch) {
        this.profile = sanitizeProfile({ ...this.profile, ...patch });
        saveProfile(this.profile);
        if (patch.code !== undefined || S.crosshairCode !== this.profile.code) {
            // Don't stomp code unless caller changed it; still keep S in sync.
            if (S.crosshairCode !== this.profile.code) set("crosshairCode", this.profile.code);
        }
        this.render();
        this._notify();
        return this.profile;
    }

    /**
     * @param {string} hex
     */
    setColor(hex) {
        return this.setProfile({ color: normalizeHex(hex) });
    }

    getProfile() {
        return { ...this.profile };
    }

    /**
     * @param {string} code
     * @returns {boolean}
     */
    applyCode(code) {
        const cleaned = normalizeCrosshairCode(code);
        if (!cleaned || !isLikelyCrosshairCode(cleaned)) return false;

        let next;
        if (cleaned === DEFAULT_CROSSHAIR_CODE) {
            next = {
                ...DEFAULT_PROFILE,
                code: cleaned,
                innerLength: 2,
                innerThickness: 2,
                innerOffset: 1,
                innerOpacity: 1,
                outer: false,
                centerDot: true,
                centerDotThickness: 2,
                centerDotOpacity: 1,
                color: this.profile.color || "#FFFFFF",
                outlines: true,
                outlineOpacity: 0.7,
                outlineThickness: 1,
            };
        } else {
            // Keep the user's chosen colour unless the code specifies one.
            const keepColor = this.profile.color;
            next = profileFromCode(cleaned, { ...DEFAULT_PROFILE, color: keepColor });
            if (!/;c;|;u;/i.test(cleaned)) next.color = keepColor;
        }

        this.profile = sanitizeProfile(next);
        saveProfile(this.profile);
        if (S.crosshairCode !== cleaned) set("crosshairCode", cleaned);
        this.render();
        this._notify();
        return true;
    }

    reset() {
        this.profile = sanitizeProfile({ ...DEFAULT_PROFILE });
        saveProfile(this.profile);
        set("crosshairCode", this.profile.code);
        this.render();
        this._notify();
        return true;
    }

    /** @type {Set<(p: CrosshairProfile) => void>} */
    _listeners = new Set();

    /**
     * @param {(p: CrosshairProfile) => void} fn
     */
    onChange(fn) {
        this._listeners.add(fn);
        return () => this._listeners.delete(fn);
    }

    _notify() {
        for (const fn of this._listeners) fn(this.getProfile());
    }

    render() {
        const p = this.profile;
        this.outlineLayer.innerHTML = "";
        this.fillLayer.innerHTML = "";

        const color = p.color;
        const drawArm = (layer, axis, sign, length, thickness, offset, opacity, asOutline) => {
            if (length <= 0 || thickness <= 0 || opacity <= 0) return;
            const el = document.createElement("i");
            el.className = "xh-piece" + (asOutline ? " outline" : "");
            const L = length * UNIT;
            const T = Math.max(1, thickness * UNIT);
            const O = offset * UNIT;
            // Centre of the arm sits at offset + half length from screen centre.
            const dist = O + L / 2;
            if (axis === "h") {
                el.style.width = L + "px";
                el.style.height = T + "px";
                el.style.transform = `translate(calc(-50% + ${sign * dist}px), -50%)`;
            } else {
                el.style.width = T + "px";
                el.style.height = L + "px";
                el.style.transform = `translate(-50%, calc(-50% + ${sign * dist}px))`;
            }
            if (asOutline) {
                el.style.setProperty("--ot", Math.max(1, p.outlineThickness) + "px");
                el.style.setProperty("--oa", String(p.outlineOpacity));
                el.style.setProperty("--a", "1");
                // Opaque fill under the outline ring so snow doesn't show through the arm body gap —
                // outline-only pieces use transparent fill + box-shadow ring.
                el.style.background = "transparent";
                el.style.boxShadow = `0 0 0 ${Math.max(1, p.outlineThickness)}px rgba(0,0,0,${p.outlineOpacity})`;
            } else {
                el.style.background = rgba(color, 1);
                el.style.opacity = String(opacity);
            }
            layer.appendChild(el);
        };

        const drawDot = (layer, size, opacity, asOutline) => {
            if (size <= 0 || opacity <= 0) return;
            const el = document.createElement("i");
            el.className = "xh-piece xh-dot" + (asOutline ? " outline" : "");
            const s = Math.max(1, size * UNIT);
            el.style.width = s + "px";
            el.style.height = s + "px";
            if (asOutline) {
                el.style.background = "transparent";
                el.style.boxShadow = `0 0 0 ${Math.max(1, p.outlineThickness)}px rgba(0,0,0,${p.outlineOpacity})`;
                el.style.opacity = "1";
            } else {
                el.style.background = rgba(color, 1);
                el.style.opacity = String(opacity);
            }
            layer.appendChild(el);
        };

        const arms = (layer, length, thickness, offset, opacity, asOutline) => {
            drawArm(layer, "h", -1, length, thickness, offset, opacity, asOutline);
            drawArm(layer, "h", 1, length, thickness, offset, opacity, asOutline);
            drawArm(layer, "v", -1, length, thickness, offset, opacity, asOutline);
            drawArm(layer, "v", 1, length, thickness, offset, opacity, asOutline);
        };

        // Outline behind fill (Valorant draws a dark ring around every piece).
        if (p.outlines && p.outlineOpacity > 0 && p.outlineThickness > 0) {
            if (p.inner && p.innerLength > 0) {
                arms(
                    this.outlineLayer,
                    p.innerLength,
                    p.innerThickness,
                    p.innerOffset,
                    1,
                    true
                );
            }
            if (p.outer && p.outerLength > 0) {
                arms(
                    this.outlineLayer,
                    p.outerLength,
                    p.outerThickness,
                    p.outerOffset,
                    1,
                    true
                );
            }
            if (p.centerDot && p.centerDotThickness > 0) {
                drawDot(this.outlineLayer, p.centerDotThickness, 1, true);
            }
        }

        if (p.inner && p.innerLength > 0 && p.innerOpacity > 0) {
            arms(
                this.fillLayer,
                p.innerLength,
                p.innerThickness,
                p.innerOffset,
                p.innerOpacity,
                false
            );
        }
        if (p.outer && p.outerLength > 0 && p.outerOpacity > 0) {
            arms(
                this.fillLayer,
                p.outerLength,
                p.outerThickness,
                p.outerOffset,
                p.outerOpacity,
                false
            );
        }
        if (p.centerDot && p.centerDotThickness > 0 && p.centerDotOpacity > 0) {
            drawDot(this.fillLayer, p.centerDotThickness, p.centerDotOpacity, false);
        }
    }
}
