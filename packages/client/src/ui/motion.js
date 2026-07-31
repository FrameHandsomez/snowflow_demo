/**
 * DOM motion helpers for HUD (skillBar / overlay / loading).
 *
 * snowflow uses DOM + CSS for UI — not Babylon.GUI. GSAP drives short
 * feedback tweens. After boot, the clock is advanced from the Babylon
 * render loop so HUD motion shares the scene frame clock.
 */

import gsap from "gsap";

let _bound = false;

/**
 * Drive GSAP from the Babylon frame loop (game-loop pattern).
 * Call once the render loop is about to start — loading still uses
 * GSAP's default ticker before this.
 *
 * @param {import("@babylonjs/core/scene").Scene} scene
 */
export function bindGsapToScene(scene) {
    if (_bound || !scene) return;
    gsap.ticker.lagSmoothing(0);
    // Stop GSAP's own rAF so we don't double-advance with the scene.
    gsap.ticker.sleep();
    scene.onBeforeRenderObservable.add(() => {
        gsap.updateRoot(performance.now() / 1000);
    });
    _bound = true;
}

/**
 * Cast-edge punch on a skill slot (scale + brightness, then settle).
 * @param {HTMLElement} el slot root (.sb-slot)
 * @returns {gsap.core.Timeline | null}
 */
export function flashSkillSlot(el) {
    if (!el) return null;
    const icon = el.querySelector(".sb-icon");
    const inner = el.querySelector(".sb-inner");
    gsap.killTweensOf([icon, inner].filter(Boolean));

    el.classList.add("flash");
    const tl = gsap.timeline({
        onComplete: () => el.classList.remove("flash"),
    });
    if (icon) {
        tl.fromTo(
            icon,
            { scale: 1, filter: "brightness(1)" },
            { scale: 1.14, filter: "brightness(1.3)", duration: 0.08, ease: "power2.out" },
            0,
        ).to(icon, {
            scale: 1,
            filter: "brightness(1)",
            duration: 0.16,
            ease: "power2.inOut",
        });
    }
    if (inner) {
        tl.fromTo(
            inner,
            { boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)" },
            {
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.4), 0 0 18px rgba(143,196,232,0.55)",
                duration: 0.08,
                ease: "power2.out",
            },
            0,
        ).to(inner, {
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
            duration: 0.18,
            ease: "power2.inOut",
        });
    }
    return tl;
}

/**
 * Open/close the F1 overlay with a short fade+slide.
 * @param {HTMLElement} el #ov
 * @param {boolean} open
 * @returns {gsap.core.Tween}
 */
export function tweenOverlay(el, open) {
    gsap.killTweensOf(el);
    if (open) {
        el.classList.add("show");
        el.style.display = "block";
        return gsap.fromTo(
            el,
            { autoAlpha: 0, x: 18 },
            { autoAlpha: 1, x: 0, duration: 0.22, ease: "power2.out" },
        );
    }
    return gsap.to(el, {
        autoAlpha: 0,
        x: 12,
        duration: 0.16,
        ease: "power2.in",
        onComplete: () => {
            el.classList.remove("show");
            el.style.display = "none";
            el.style.transform = "";
        },
    });
}

/**
 * Boot screen exit + hint pulse (replaces class toggles + fixed timeouts).
 * Runs after the scene loop owns the GSAP clock.
 *
 * @param {HTMLElement | null} root #boot
 * @param {HTMLElement | null} hint #hint
 * @returns {Promise<void>}
 */
export function tweenBootDone(root, hint) {
    return new Promise((resolve) => {
        const tl = gsap.timeline({
            onComplete: () => {
                root?.remove();
                resolve();
            },
        });
        if (root) {
            tl.to(root, {
                autoAlpha: 0,
                duration: 0.9,
                ease: "power2.inOut",
                onStart: () => {
                    root.style.pointerEvents = "none";
                },
            }, 0);
        }
        if (hint) {
            hint.classList.add("show");
            tl.fromTo(
                hint,
                { autoAlpha: 0 },
                { autoAlpha: 1, duration: 0.45, ease: "power2.out" },
                0.15,
            );
            tl.to(hint, {
                autoAlpha: 0,
                duration: 0.5,
                ease: "power1.in",
                delay: 5.2,
                onComplete: () => hint.classList.remove("show"),
            });
        }
        if (!root && !hint) resolve();
    });
}

export { gsap };
