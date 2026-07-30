/**
 * Bottom skill bar for spells 1–5 (LoL-style circular slots).
 *
 * Reads live state from SpellSystem.hudSlots() each frame:
 *   - ready / active remaining / hold (ribbon)
 *   - key labels from bindings
 * No mana gate — "flow" numbers are flavour costs for the look of the bar.
 */

import { S, onChange } from "../core/settings.js";
import { bindings, formatCode } from "../core/bindings.js";

/** Flavour costs under the icon (not enforced). */
const FLOW_COST = [15, 0, 40, 55, 70];

/**
 * Inline SVG glyphs — water-bending themed, monochrome so CSS can tint.
 * @type {string[]}
 */
const ICONS = [
    // 1 Sweep — crescent wave
    `<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M8 40c8-18 22-28 40-30-6 10-8 20-6 30 4 2 8 2 12 0-4 14-16 22-30 22S4 52 8 40zm14 2c6-2 12-8 14-16-10 4-16 10-14 16z"/></svg>`,
    // 2 Ribbon — flowing stream
    `<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M10 18c12 0 14 10 26 10s14-10 18-10v10c-6 0-10 8-20 8S20 28 10 28V18zm0 18c12 0 14 10 26 10s14-10 18-10v10c-6 0-10 8-20 8S20 46 10 46V36z"/></svg>`,
    // 3 Bloom — rising column / burst
    `<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M32 6c2 10 4 16 4 26h-8c0-10 2-16 4-26zm-2 28h4v24h-4V34zM18 22c6 6 10 12 12 20h-6c-2-6-6-10-12-14l6-6zm28 0l6 6c-6 4-10 8-12 14h-6c2-8 6-14 12-20zM12 50h40v6H12z"/></svg>`,
    // 4 Crystallize — crystal cluster
    `<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M32 4l10 18H22L32 4zm0 56L18 34h28L32 60zM8 30l12-6 6 12-12 6-6-12zm48 0l-6 12-12-6 6-12 12 6zM22 22h20l-4 8H26l-4-8z"/></svg>`,
    // 5 Vortex — spiral
    `<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M32 8c13 0 24 9 24 20h-8c0-6-7-12-16-12S16 22 16 28s7 12 16 12 16-5 16-12h8c0 11-11 20-24 20S8 39 8 28 19 8 32 8zm0 14c5 0 8 3 8 6s-3 6-8 6-8-3-8-6 3-6 8-6z"/></svg>`,
];

const NAMES = ["Sweep", "Ribbon", "Bloom", "Crystallize", "Vortex"];
const ACCENTS = ["#5ec8ff", "#7ad4ff", "#9ae0ff", "#b8ecff", "#4db8e8"];

export class SkillBar {
    constructor() {
        /** @type {HTMLElement} */
        this.root = document.createElement("div");
        this.root.id = "skill-bar";
        this.root.setAttribute("aria-label", "Spell skills");

        /** @type {HTMLElement[]} */
        this.slots = [];
        /** @type {HTMLElement[]} */
        this.cdEls = [];
        /** @type {HTMLElement[]} */
        this.keyEls = [];
        /** @type {HTMLElement[]} */
        this.costEls = [];
        /** @type {HTMLElement[]} */
        this.ringEls = [];
        /** @type {HTMLElement[]} */
        this.iconWraps = [];

        this._style();
        this._build();
        document.body.appendChild(this.root);

        this._applyVisible();
        onChange("showSkillBar", () => this._applyVisible());
        onChange("showSpells", () => this._applyVisible());

        /** Flash timers per slot (seconds remaining). */
        this._flash = [0, 0, 0, 0, 0];
        /** @type {boolean[]} */
        this._wasActive = [false, false, false, false, false];
    }

    _style() {
        if (document.getElementById("skill-bar-css")) return;
        const s = document.createElement("style");
        s.id = "skill-bar-css";
        s.textContent = `
#skill-bar {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 120;
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 12px 16px 14px;
  pointer-events: none;
  user-select: none;
  opacity: 1;
  background: linear-gradient(180deg, rgba(4,8,12,0.32), rgba(4,8,12,0.72));
  border: 1px solid rgba(143,196,232,0.28);
  border-radius: 20px;
  backdrop-filter: blur(14px) saturate(1.18);
  box-shadow:
    0 12px 30px rgba(0,0,0,0.42),
    0 0 0 1px rgba(255,255,255,0.05) inset,
    0 0 24px rgba(90,150,190,0.12);
  transition: opacity 280ms ease, transform 280ms ease;
}
#skill-bar::before {
  content: "SKILLS";
  position: absolute;
  left: 50%;
  top: -11px;
  transform: translateX(-50%);
  padding: 0 8px;
  background: rgba(4,8,12,0.88);
  color: rgba(219,230,242,0.72);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}
#skill-bar.hidden { opacity: 0; visibility: hidden; transform: translateX(-50%) translateY(8px); }
#skill-bar .sb-slot {
  position: relative;
  width: 62px;
  height: 62px;
  flex: 0 0 auto;
}
#skill-bar .sb-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  /* Clock wipe: filled = remaining while active; full soft ring when ready. */
  background: conic-gradient(
    from -90deg,
    var(--sb-accent, #5ec8ff) 0 var(--sb-p, 100%),
    rgba(255,255,255,0.07) var(--sb-p, 100%) 100%
  );
  box-shadow:
    0 0 0 2px rgba(0,0,0,0.7),
    0 0 0 3px rgba(120,170,210,0.2),
    0 8px 22px rgba(0,0,0,0.45);
}
#skill-bar .sb-inner {
  position: absolute;
  inset: 4px;
  border-radius: 50%;
  background:
    radial-gradient(circle at 35% 28%, rgba(255,255,255,0.14), transparent 45%),
    linear-gradient(160deg, #1a2a3c 0%, #0b121c 55%, #070b12 100%);
  display: grid;
  place-items: center;
  overflow: hidden;
  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,0.06),
    0 0 0 1px rgba(0,0,0,0.35);
}
#skill-bar .sb-icon {
  width: 28px;
  height: 28px;
  color: var(--sb-accent, #8fc4e8);
  opacity: 0.92;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.6));
  transition: transform 120ms ease, opacity 120ms ease, filter 120ms ease;
}
#skill-bar .sb-icon svg { width: 100%; height: 100%; display: block; }
#skill-bar .sb-cd {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-family: ui-sans-serif, "Segoe UI", system-ui, sans-serif;
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  color: #f2f7fc;
  text-shadow: 0 1px 3px rgba(0,0,0,0.95), 0 0 10px rgba(0,0,0,0.5);
  opacity: 0;
  pointer-events: none;
}
#skill-bar .sb-cd.on { opacity: 1; }
#skill-bar .sb-key {
  position: absolute;
  right: -2px;
  bottom: -2px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 4px;
  background: rgba(6,10,16,0.88);
  border: 1px solid rgba(180,210,235,0.28);
  color: rgba(230,238,248,0.9);
  font-size: 10px;
  font-weight: 600;
  line-height: 14px;
  text-align: center;
  box-shadow: 0 2px 6px rgba(0,0,0,0.5);
}
#skill-bar .sb-cost {
  position: absolute;
  left: 50%;
  bottom: -16px;
  transform: translateX(-50%);
  font-size: 10px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  color: rgba(160,200,230,0.72);
  text-shadow: 0 1px 4px rgba(0,0,0,0.85);
  white-space: nowrap;
}
#skill-bar .sb-slot.active .sb-inner {
  background:
    radial-gradient(circle at 40% 30%, rgba(120,200,255,0.18), transparent 50%),
    linear-gradient(160deg, #24384e 0%, #101820 100%);
}
#skill-bar .sb-slot.active .sb-icon {
  opacity: 0.35;
  filter: grayscale(0.3) brightness(0.7);
}
#skill-bar .sb-slot.hold .sb-ring {
  box-shadow:
    0 0 0 2px rgba(0,0,0,0.65),
    0 0 0 3px rgba(126,210,255,0.55),
    0 0 18px rgba(94,200,255,0.35),
    inset 0 1px 0 rgba(255,255,255,0.14);
}
#skill-bar .sb-slot.hold .sb-icon {
  opacity: 1;
  color: #c8ecff;
  animation: sb-pulse 0.9s ease-in-out infinite;
}
#skill-bar .sb-slot.flash .sb-inner {
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.35), 0 0 16px rgba(143,196,232,0.55);
}
#skill-bar .sb-slot.flash .sb-icon {
  transform: scale(1.12);
  opacity: 1;
  filter: brightness(1.25);
}
#skill-bar .sb-slot.dim .sb-icon { opacity: 0.45; }
@keyframes sb-pulse {
  0%, 100% { transform: scale(1); opacity: 0.95; }
  50% { transform: scale(1.06); opacity: 1; }
}
@media (max-width: 640px) {
  #skill-bar { gap: 6px; bottom: 18px; padding: 6px; }
  #skill-bar .sb-slot { width: 48px; height: 48px; }
  #skill-bar .sb-icon { width: 22px; height: 22px; }
  #skill-bar .sb-cd { font-size: 13px; }
  #skill-bar .sb-cost { bottom: -14px; font-size: 9px; }
}
/* Clear the skill bar, its heading, and the cost labels. */
body.has-skill-bar #hint {
  bottom: 132px;
}
@media (max-width: 640px) {
  body.has-skill-bar #hint {
    bottom: 108px;
  }
}
`;
        document.head.appendChild(s);
    }

    _build() {
        for (let i = 0; i < 5; i++) {
            const slot = document.createElement("div");
            slot.className = "sb-slot";
            slot.dataset.i = String(i);
            slot.title = `${NAMES[i]} (${i + 1})`;
            slot.style.setProperty("--sb-accent", ACCENTS[i]);
            slot.style.setProperty("--sb-p", "0%");

            const ring = document.createElement("div");
            ring.className = "sb-ring";

            const inner = document.createElement("div");
            inner.className = "sb-inner";

            const icon = document.createElement("div");
            icon.className = "sb-icon";
            icon.innerHTML = ICONS[i];

            const cd = document.createElement("div");
            cd.className = "sb-cd";
            cd.textContent = "";

            inner.appendChild(icon);
            inner.appendChild(cd);
            slot.appendChild(ring);
            slot.appendChild(inner);

            const key = document.createElement("div");
            key.className = "sb-key";
            key.textContent = String(i + 1);
            slot.appendChild(key);

            const cost = document.createElement("div");
            cost.className = "sb-cost";
            cost.textContent = FLOW_COST[i] > 0 ? String(FLOW_COST[i]) : "hold";
            slot.appendChild(cost);

            this.root.appendChild(slot);
            this.slots.push(slot);
            this.ringEls.push(ring);
            this.cdEls.push(cd);
            this.keyEls.push(key);
            this.costEls.push(cost);
            this.iconWraps.push(icon);
        }
    }

    _applyVisible() {
        const on = S.showSkillBar !== false;
        this.root.classList.toggle("hidden", !on);
        document.body.classList.toggle("has-skill-bar", on);
    }

    /** Refresh key labels from current bindings. */
    refreshKeys() {
        for (let i = 0; i < 5; i++) {
            const pair = bindings[`spell${i + 1}`];
            const code = pair && pair[0] ? pair[0] : `Digit${i + 1}`;
            this.keyEls[i].textContent = formatCode(code);
        }
    }

    /**
     * @param {import("../spells/spellSystem.js").SpellSystem} spells
     * @param {number} dt
     */
    update(spells, dt) {
        if (S.showSkillBar === false) return;
        this.refreshKeys();

        const slots = spells.hudSlots ? spells.hudSlots() : null;
        if (!slots) return;

        for (let i = 0; i < 5; i++) {
            const st = slots[i];
            const el = this.slots[i];
            const cd = this.cdEls[i];

            const active = !!st.active;
            const hold = !!st.hold;
            const rem = st.remaining || 0;
            const dur = st.duration || 1;
            const p = active && dur > 0 ? Math.max(0, Math.min(1, rem / dur)) : 0;

            // Cast edge → flash
            if (active && !this._wasActive[i]) this._flash[i] = 0.22;
            this._wasActive[i] = active;
            if (this._flash[i] > 0) this._flash[i] = Math.max(0, this._flash[i] - dt);

            el.classList.toggle("active", active && !hold);
            el.classList.toggle("hold", hold);
            el.classList.toggle("flash", this._flash[i] > 0);
            el.classList.toggle("dim", active && !hold);

            // Conic: empty track when ready; full→empty while active (remaining).
            const pct = active ? Math.max(2, p * 100) : 0;
            el.style.setProperty("--sb-p", `${pct}%`);

            if (hold) {
                cd.textContent = "…";
                cd.classList.add("on");
            } else if (active && rem > 0.05) {
                cd.textContent = rem >= 10 ? rem.toFixed(0) : rem.toFixed(1);
                cd.classList.add("on");
            } else {
                cd.textContent = "";
                cd.classList.remove("on");
            }

            el.title = st.hold
                ? `${st.name} — hold ${this.keyEls[i].textContent}`
                : active
                    ? `${st.name} — ${rem.toFixed(1)}s left`
                    : `${st.name} — ready`;
        }
    }
}
