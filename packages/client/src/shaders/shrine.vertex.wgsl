// Static ice ruin vertex placement.

attribute position: vec3f;
attribute normal: vec3f;

uniform viewProjection: mat4x4f;
uniform cameraPos: vec3f;

varying vWorld: vec3f;
varying vNormal: vec3f;
varying vViewDist: f32;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
    let P = input.position;
    vertexOutputs.vWorld = P;
    vertexOutputs.vNormal = input.normal;
    vertexOutputs.vViewDist = distance(P, uniforms.cameraPos);
    vertexOutputs.position = uniforms.viewProjection * vec4f(P, 1.0);
}
