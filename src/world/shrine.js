import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Vector3, Vector4 } from "@babylonjs/core/Maths/math";

import { S } from "../core/settings.js";
import { whenReady, bindMatrixArray } from "../core/gpuUtil.js";
import { CASCADE_COUNT } from "../render/shadows.js";
import { SPELL_LIGHT_UNIFORMS } from "../spells/spellLights.js";

export const SHRINE_SPAWN = Object.freeze({ x: 8, z: -6 });

/**
 * Flat courtyard radius around the spawn. Inside this ring the snow is flattened
 * to the authored pad height instead of showing the raw heightfield dunes.
 * Covers the gate approach, side walls, and altar apron.
 */
export const COURTYARD_RADIUS = 20.0;
/** Soft blend width at the courtyard rim so the pad slopes into the surrounding snow. */
export const COURTYARD_BLEND = 10.0;

/**
 * Static world-space collision volume. It deliberately has no Babylon types:
 * shrine gameplay must not depend on the render mesh or its lifecycle.
 *
 * @typedef {{minX:number, minY:number, minZ:number, maxX:number, maxY:number, maxZ:number}} StaticObstacleAabb
 */

const SHRINE_CASCADES = 2;
const BASE_RADIUS = 7.2;
const _flatNormal = new Vector3(0, 1, 0);
const _blendNormal = new Vector3();

const _splits = new Vector4();
const _cameraPos = new Vector3();

/**
 * A permanent ice ruin near the start point.
 *
 * It is intentionally static: the mesh uses ordinary world-space positions, so
 * the beauty, shadow, and camera-depth passes all render the same geometry.
 */
export class SpawnShrine {
    constructor(scene, terrain, sky, shadows) {
        this.scene = scene;
        this.terrain = terrain;
        this.sky = sky;
        this.shadows = shadows;

        const built = buildMesh(scene, terrain, SHRINE_SPAWN.x, SHRINE_SPAWN.z);
        this.mesh = built.mesh;
        /** @type {readonly StaticObstacleAabb[]} */
        this.obstacles = built.obstacles;
        /** Shared courtyard floor height used by mesh, collision, and grounding. */
        this.padY = built.padY;
        this.padRadius = COURTYARD_RADIUS;
        this.padBlend = COURTYARD_BLEND;
        this.material = this._makeMaterial();
        this.mesh.material = this.material;
        this.mesh.renderingGroupId = 1;

        /** @type {ShaderMaterial[]} */
        this._depthMats = [];
        shadows.registerCaster(
            this.mesh, (cascade) => this._makeDepthMaterial(cascade), SHRINE_CASCADES
        );

        this._pushUniforms(_cameraPos);
    }

    /**
     * Horizontal weight of the flat courtyard pad at a world XZ sample.
     * 1 = fully on the pad, 0 = pure heightfield.
     */
    padWeight(x, z) {
        const dx = x - SHRINE_SPAWN.x;
        const dz = z - SHRINE_SPAWN.z;
        const r = Math.hypot(dx, dz);
        const inner = this.padRadius - this.padBlend;
        if (r <= inner) return 1;
        if (r >= this.padRadius) return 0;
        const t = (r - inner) / this.padBlend;
        // Smoothstep falloff so walk/surf don't hitch at the rim.
        return 1 - t * t * (3 - 2 * t);
    }

    /**
     * Gameplay ground height: flat pad inside the courtyard, terrain outside,
     * with a soft blend at the rim so the player never steps a cliff edge.
     */
    heightAt(x, z) {
        const w = this.padWeight(x, z);
        if (w <= 0) return this.terrain.heightAt(x, z);
        if (w >= 1) return this.padY;
        return this.padY * w + this.terrain.heightAt(x, z) * (1 - w);
    }

    /**
     * Ground normal matching {@link heightAt}. Fully flat on the pad core so
     * walk/surf lean does not fight a dune under the ruin floor.
     * @param {import("@babylonjs/core/Maths/math.vector").Vector3} out
     */
    normalAt(x, z, out) {
        const w = this.padWeight(x, z);
        if (w >= 1) {
            out.copyFrom(_flatNormal);
            return out;
        }
        this.terrain.normalAt(x, z, out);
        if (w <= 0) return out;
        _blendNormal.copyFrom(_flatNormal);
        out.x = out.x * (1 - w) + _blendNormal.x * w;
        out.y = out.y * (1 - w) + _blendNormal.y * w;
        out.z = out.z * (1 - w) + _blendNormal.z * w;
        const len = Math.hypot(out.x, out.y, out.z) || 1;
        out.x /= len;
        out.y /= len;
        out.z /= len;
        return out;
    }

    _makeMaterial() {
        const mat = new ShaderMaterial(
            "spawnShrine", this.scene, { vertex: "shrine", fragment: "shrine" },
            {
                attributes: ["position", "normal"],
                uniforms: [
                    "viewProjection", "cameraPos", "sunDir", "sunRadiance", "shR",
                    "cascadeMatrices", "cascadeSplits", "cascadeParams",
                    "shadowTexel", "shadowSoftness", "shadowBias",
                    "fogDensity", "fogHeightFalloff", "fogStart", "aerialStrength",
                    "ambientIntensity", "sssStrength", "glintIntensity", "glintGrazing",
                    ...SPELL_LIGHT_UNIFORMS,
                ],
                samplers: ["skyLUT", "cascade0", "cascade1", "cascade2"],
                shaderLanguage: ShaderLanguage.WGSL,
            }
        );
        mat.backFaceCulling = false;
        mat.setTexture("skyLUT", this.sky.lut);
        for (let i = 0; i < CASCADE_COUNT; i++) {
            mat.setTexture("cascade" + i, this.shadows.maps[i]);
        }
        return mat;
    }

    _makeDepthMaterial(cascade) {
        const mat = new ShaderMaterial(
            "spawnShrineDepth" + cascade, this.scene,
            { vertex: "shrineDepth", fragment: "terrainDepth" },
            {
                attributes: ["position"],
                uniforms: ["lightViewProjection"],
                shaderLanguage: ShaderLanguage.WGSL,
                defines: ["SHRINE_CASCADE " + cascade],
            }
        );
        mat.backFaceCulling = false;
        this._depthMats.push(mat);
        return mat;
    }

    registerPrepass(depth) {
        const mat = new ShaderMaterial(
            "spawnShrinePrepass", this.scene,
            { vertex: "shrinePrepass", fragment: "prepass" },
            {
                attributes: ["position"],
                uniforms: ["viewProjection"],
                shaderLanguage: ShaderLanguage.WGSL,
            }
        );
        mat.backFaceCulling = false;
        this.prepassMat = mat;
        depth.registerCaster(this.mesh, mat);
    }

    update(cameraPos, lights) {
        this._pushUniforms(cameraPos, lights);
    }

    _pushUniforms(cameraPos, lights) {
        _cameraPos.copyFrom(cameraPos);
        const m = this.material;
        const sky = this.sky;
        const sh = this.shadows;

        m.setVector3("cameraPos", _cameraPos);
        m.setVector3("sunDir", sky.sunDir);
        m.setColor3("sunRadiance", sky.sunRadiance);
        m.setArray4("shR", sky.sh);
        bindMatrixArray(m, "cascadeMatrices", sh.matrixData);
        _splits.set(sh.splits[0], sh.splits[1], sh.splits[2], sh.splits[3]);
        m.setVector4("cascadeSplits", _splits);
        m.setArray4("cascadeParams", sh.paramData);
        m.setFloat("shadowTexel", sh.texelSize);
        m.setFloat("shadowSoftness", 1.3);
        m.setFloat("shadowBias", 0.012);
        m.setFloat("fogDensity", S.fogDensity);
        m.setFloat("fogHeightFalloff", S.fogHeightFalloff);
        m.setFloat("fogStart", S.fogStart);
        m.setFloat("aerialStrength", S.aerialStrength);
        m.setFloat("ambientIntensity", S.ambientIntensity);
        m.setFloat("sssStrength", S.sssStrength);
        m.setFloat("glintIntensity", S.glintIntensity);
        m.setFloat("glintGrazing", S.glintGrazing);
        lights?.apply(m);
    }

    async warmUp() {
        await whenReady(this.material, "shrine material", [this.mesh, false]);
        for (let i = 0; i < this._depthMats.length; i++) {
            await whenReady(this._depthMats[i], this._depthMats[i].name, [this.mesh, false]);
        }
        if (this.prepassMat) {
            await whenReady(this.prepassMat, "shrine prepass", [this.mesh, false]);
        }
    }

    /**
     * Visual pack only — gameplay grounding still uses {@link heightAt}.
     * Compress the courtyard disc and approach so the snow reads as a worked pad
     * under the leveled ruin, without relying on deform for collision.
     */
    stampSnow() {
        const deform = this.terrain.deform;
        const cx = SHRINE_SPAWN.x;
        const cz = SHRINE_SPAWN.z;
        // Broad outer settle around the whole ruin footprint.
        deform.brush(cx, cz, BASE_RADIUS + 0.8, 0.12, 0.09, 0.38, 0.46, 0, 1, 0.5);
        // Flat courtyard core matching padRadius — low berm so the floor stays open.
        deform.brush(cx, cz, this.padRadius * 0.92, 0.18, 0.04, 0.55, 0.62, 0, 1, 0.28);
        // Soft rim ring where pad blends back into dunes.
        deform.brush(cx, cz, this.padRadius + 0.35, 0.08, 0.07, 0.32, 0.4, 0, 1, 0.62);
        // South approach steps / gate path.
        deform.brush(cx, cz - 6.4, 3.35, 0.12, 0.05, 0.4, 0.42, 0, 1.85, 0.36);
        // North altar apron.
        deform.brush(cx, cz + 4.9, 2.65, 0.14, 0.06, 0.52, 0.6, 0, 1.15, 0.45);
    }

    dispose() {
        this.mesh.dispose();
        this.material.dispose();
        this.prepassMat?.dispose();
        for (let i = 0; i < this._depthMats.length; i++) this._depthMats[i].dispose();
    }
}

/**
 * Sample a stable courtyard floor from the heightfield. Uses the spawn centre
 * plus a ring of interior points so one dune spike does not lift the whole ruin.
 */
function samplePadY(terrain, cx, cz) {
    let sum = terrain.heightAt(cx, cz);
    let n = 1;
    const ring = 2.4;
    for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        sum += terrain.heightAt(cx + Math.cos(a) * ring, cz + Math.sin(a) * ring);
        n++;
    }
    return sum / n;
}

function buildMesh(scene, terrain, cx, cz) {
    const positions = [];
    const normals = [];
    const indices = [];
    /** @type {StaticObstacleAabb[]} */
    const obstacles = [];
    // One shared floor for every module — ruin pieces must not stair-step dunes.
    const padY = samplePadY(terrain, cx, cz);

    const addBox = (x0, y0, z0, x1, y1, z1) => {
        const base = positions.length / 3;
        const faces = [
            [[0, 0, -1], [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]],
            [[0, 0, 1], [x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1]],
            [[-1, 0, 0], [x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1]],
            [[1, 0, 0], [x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]],
            [[0, 1, 0], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]],
            [[0, -1, 0], [x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]],
        ];
        for (let f = 0; f < faces.length; f++) {
            const [normal, ...verts] = faces[f];
            for (let i = 0; i < verts.length; i++) {
                positions.push(...verts[i]);
                normals.push(...normal);
            }
            const o = base + f * 4;
            indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
        }
    };

    const addModule = (x, z, halfX, halfZ, bottom, top, blocksMovement = false) => {
        const y = padY;
        const minX = cx + x - halfX;
        const minY = y + bottom;
        const minZ = cz + z - halfZ;
        const maxX = cx + x + halfX;
        const maxY = y + top;
        const maxZ = cz + z + halfZ;
        addBox(minX, minY, minZ, maxX, maxY, maxZ);
        if (blocksMovement) {
            obstacles.push(Object.freeze({ minX, minY, minZ, maxX, maxY, maxZ }));
        }
    };

    // Low outer blocks define the courtyard without constricting the spawn space.
    for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        addModule(Math.cos(a) * 5.5, Math.sin(a) * 5.5, 1.32, 1.32, -0.32, 0.12);
    }

    // South approach: broad shallow steps frame a clear entrance into the courtyard.
    addModule(0, -8.2, 2.8, 0.9, -0.12, 0.12);
    addModule(0, -7.25, 2.35, 0.75, -0.08, 0.24);
    addModule(0, -6.45, 1.9, 0.62, -0.04, 0.36);

    // Broken gate piers preserve an open central route while giving the entry scale.
    addModule(-4.65, -5.15, 0.7, 0.7, 0, 4.65, true);
    addModule(4.65, -5.15, 0.62, 0.68, 0, 3.35, true);
    addModule(-2.85, -5.05, 1.35, 0.48, 2.55, 3.18);

    // Damaged side walls frame the courtyard but keep gaps for movement and sightlines.
    addModule(-5.65, -1.9, 0.52, 1.55, -0.1, 1.7, true);
    addModule(-5.48, 2.35, 0.56, 1.25, -0.1, 2.4, true);
    addModule(5.6, -1.4, 0.52, 1.4, -0.1, 2.15, true);
    addModule(5.45, 2.9, 0.58, 1.45, -0.1, 1.35, true);

    const pillars = [
        [-4.65, -3.55, 5.35, 0.52],
        [4.45, -3.85, 6.45, 0.48],
        [-4.8, 3.62, 4.25, 0.56],
        [4.58, 3.9, 5.45, 0.50],
        [0.45, 5.28, 3.15, 0.60],
    ];
    for (let i = 0; i < pillars.length; i++) {
        const [x, z, height, width] = pillars[i];
        addModule(x, z, width, width, 0, height, true);
    }

    // Tiered north altar makes the ruin read as a destination beyond the courtyard.
    addModule(0, 5.15, 1.75, 1.25, -0.14, 0.52, true);
    addModule(0, 5.15, 1.18, 0.84, 0.52, 1.05);
    addModule(0, 5.15, 0.58, 0.42, 1.05, 1.72);

    // Collapsed masonry collects at the edge of walls and pillars, never at spawn.
    const rubble = [
        [-4.2, -5.8, 0.72, 0.38, 0.38], [-5.0, -4.1, 0.48, 0.62, 0.52],
        [4.0, -5.7, 0.68, 0.35, 0.44], [5.1, -3.1, 0.42, 0.72, 0.35],
        [-5.2, 0.1, 0.7, 0.32, 0.38], [-4.2, 4.55, 0.58, 0.52, 0.46],
        [5.15, 4.55, 0.75, 0.3, 0.34], [2.5, 5.8, 0.72, 0.42, 0.42],
    ];
    for (let i = 0; i < rubble.length; i++) {
        const [x, z, halfX, halfZ, height] = rubble[i];
        addModule(x, z, halfX, halfZ, -0.08, height);
    }

    const vd = new VertexData();
    vd.positions = positions;
    vd.normals = normals;
    vd.indices = indices;

    const mesh = new Mesh("spawnShrine", scene);
    vd.applyToMesh(mesh, false);
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.metadata = { triangles: indices.length / 3, vertices: positions.length / 3, padY };
    return { mesh, obstacles: Object.freeze(obstacles), padY };
}
