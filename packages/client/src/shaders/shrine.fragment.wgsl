// Static ice ruin shading. The geometry is stone under a thin frozen skin.

#include<snowNoise>
#include<snowShading>
#include<snowSpellLights>
#include<snowAtmosphere>

varying vWorld: vec3f;
varying vNormal: vec3f;
varying vViewDist: f32;

var skyLUT: texture_2d<f32>;
var skyLUTSampler: sampler;
var cascade0: texture_2d<f32>;
var cascade0Sampler: sampler;
var cascade1: texture_2d<f32>;
var cascade1Sampler: sampler;
var cascade2: texture_2d<f32>;
var cascade2Sampler: sampler;

uniform cameraPos: vec3f;
uniform sunDir: vec3f;
uniform sunRadiance: vec3f;
uniform shR: array<vec4f, 9>;

uniform cascadeMatrices: array<mat4x4f, 3>;
uniform cascadeSplits: vec4f;
uniform cascadeParams: array<vec4f, 3>;
uniform shadowTexel: f32;
uniform shadowSoftness: f32;
uniform shadowBias: f32;

uniform fogDensity: f32;
uniform fogHeightFalloff: f32;
uniform fogStart: f32;
uniform aerialStrength: f32;
uniform ambientIntensity: f32;
uniform sssStrength: f32;
uniform glintIntensity: f32;
uniform glintGrazing: f32;

uniform spellLightPos: array<vec4f, 4>;
uniform spellLightCol: array<vec4f, 4>;
uniform spellLightCount: f32;

#include<snowShadowLookup>

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
    let world = input.vWorld;
    let V = normalize(uniforms.cameraPos - world);
    let L = uniforms.sunDir;
    var N = normalize(input.vNormal);
    if (dot(N, V) < 0.0) { N = -N; }

    let shadow = sunShadow(world, N, input.vViewDist, ign(input.position.xy) * 6.28318530718);
    let NdotL = dot(N, L);
    let NdotV = clamp(dot(N, V), 1e-4, 1.0);
    let grain = noise2(world.xz * 2.3) * 0.5 + 0.5;
    let frost = smoothstep(0.28, 0.82, grain) * smoothstep(0.05, 0.55, N.y);

    let stone = mix(vec3f(0.18, 0.27, 0.34), vec3f(0.48, 0.61, 0.68), frost);
    let roughness = mix(0.66, 0.22, frost);
    let sun = uniforms.sunRadiance;
    const INV_PI: f32 = 0.31830988618;

    var color = stone * INV_PI * sun * wrapDiffuse(NdotL, 0.32) * shadow;
    color += stone * INV_PI * shIrradiance(N, uniforms.shR) * uniforms.ambientIntensity;
    color += snowSubsurface(N, L, V, sun, 0.25, uniforms.sssStrength, 0.7)
        * vec3f(0.54, 0.72, 0.82) * frost * shadow;

    let H = normalize(V + L);
    let D = distributionGGX(clamp(dot(N, H), 0.0, 1.0), roughness);
    let Vis = visSmithGGXCorrelated(NdotV, max(NdotL, 1e-4), roughness);
    let F = fresnelSchlick(clamp(dot(V, H), 0.0, 1.0), vec3f(0.035));
    color += sun * D * Vis * F * max(NdotL, 0.0) * shadow;

    if (uniforms.spellLightCount > 0.5) {
        color += spellLightingSurface(
            world, N, V, stone, vec3f(0.035), roughness, 0.4,
            uniforms.spellLightPos, uniforms.spellLightCol, uniforms.spellLightCount
        );
    }

    color = applyAerial(
        color, uniforms.cameraPos, world, -V, L,
        skyLUT, skyLUTSampler, sun,
        uniforms.fogDensity, uniforms.fogHeightFalloff, uniforms.fogStart,
        uniforms.aerialStrength
    );
    fragmentOutputs.color = vec4f(color, 1.0);
}
