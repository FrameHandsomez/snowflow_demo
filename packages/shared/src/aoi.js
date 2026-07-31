/**
 * Interest Management helpers (Phase 1 AOI).
 * Grid cells — design early even with 2–3 test clients.
 */

import { AOI_CELL_SIZE_M } from "./constants.js";

/**
 * @param {number} x world metres
 * @param {number} z world metres
 * @param {number} [cellSize]
 * @returns {{ cx: number, cz: number }}
 */
export function cellOf(x, z, cellSize = AOI_CELL_SIZE_M) {
    const s = cellSize > 0 ? cellSize : AOI_CELL_SIZE_M;
    return {
        cx: Math.floor(x / s),
        cz: Math.floor(z / s),
    };
}

/**
 * Chebyshev distance in cell space (square AOI).
 * @param {{ cx: number, cz: number }} a
 * @param {{ cx: number, cz: number }} b
 */
export function cellChebyshev(a, b) {
    return Math.max(Math.abs(a.cx - b.cx), Math.abs(a.cz - b.cz));
}

/**
 * True if observer should receive subject state.
 * @param {number} ox
 * @param {number} oz
 * @param {number} sx
 * @param {number} sz
 * @param {number} [radiusCells] inclusive Chebyshev radius (1 = 3×3 neighbourhood)
 * @param {number} [cellSize]
 */
export function inAoi(ox, oz, sx, sz, radiusCells = 1, cellSize = AOI_CELL_SIZE_M) {
    const a = cellOf(ox, oz, cellSize);
    const b = cellOf(sx, sz, cellSize);
    return cellChebyshev(a, b) <= radiusCells;
}

/**
 * Diff two interest id sets (e.g. previous AOI peers vs current).
 * @param {Iterable<string>} prev
 * @param {Iterable<string>} next
 * @returns {{ entered: string[], left: string[] }}
 */
export function diffInterest(prev, next) {
    const a = prev instanceof Set ? prev : new Set(prev || []);
    const b = next instanceof Set ? next : new Set(next || []);
    /** @type {string[]} */
    const entered = [];
    /** @type {string[]} */
    const left = [];
    for (const id of b) {
        if (!a.has(id)) entered.push(id);
    }
    for (const id of a) {
        if (!b.has(id)) left.push(id);
    }
    return { entered, left };
}
