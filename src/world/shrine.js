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

const SHRINE_X = 8;
const SHRINE_Z = -6;
const SHRINE_CASCADES = 2;
const BASE_RADIUS = 2.7;
const PILLAR_COUNT = 5;

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

        const y = terrain.heightAt(SHRINE_X, SHRINE_Z);
        this.mesh = buildMesh(scene, SHRINE_X, y, SHRINE_Z);
        this.material = this._makeMaterial();
        this.mesh.material = this.material;
        this.mesh.renderingGroupId = 1;

        /** @type {ShaderMaterial[]} */
        this._depthMats = [];
        shadows.registerCaster(
            this.mesh, (cascade) => this._makeDepthMaterial(cascade), SHRINE_CASCADES
        );

        this._deformBase();
        this._pushUniforms(_cameraPos);
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

    _deformBase() {
        this.terrain.deform.brush(
            SHRINE_X, SHRINE_Z, BASE_RADIUS + 0.6,
            -0.12, 0.08, 0.35, 0.5, 0, 1, 0.5
        );
    }

    dispose() {
        this.mesh.dispose();
        this.material.dispose();
        this.prepassMat?.dispose();
        for (let i = 0; i < this._depthMats.length; i++) this._depthMats[i].dispose();
    }
}

function buildMesh(scene, cx, cy, cz) {
    const positions = [];
    const normals = [];
    const indices = [];

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

    // An octagonal plinth, represented by tapered perimeter blocks.
    for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        const x = cx + Math.cos(a) * BASE_RADIUS * 0.62;
        const z = cz + Math.sin(a) * BASE_RADIUS * 0.62;
        addBox(x - 0.78, cy - 0.24, z - 0.78, x + 0.78, cy + 0.06, z + 0.78);
    }

    const pillars = [
        [-1.65, -1.3, 2.65, 0.30],
        [1.55, -1.45, 3.35, 0.26],
        [-1.7, 1.28, 2.05, 0.32],
        [1.6, 1.4, 2.7, 0.28],
        [0.15, 1.9, 1.45, 0.35],
    ];
    for (let i = 0; i < pillars.length; i++) {
        const [x, z, height, width] = pillars[i];
        addBox(
            cx + x - width, cy, cz + z - width,
            cx + x + width, cy + height, cz + z + width
        );
    }

    // Collapsed lintel gives the silhouette an unmistakable ruined structure.
    addBox(cx - 1.72, cy + 2.28, cz - 1.56, cx + 1.72, cy + 2.62, cz - 0.96);

    const vd = new VertexData();
    vd.positions = positions;
    vd.normals = normals;
    vd.indices = indices;

    const mesh = new Mesh("spawnShrine", scene);
    vd.applyToMesh(mesh, false);
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.metadata = { triangles: indices.length / 3, vertices: positions.length / 3 };
    return mesh;
}
