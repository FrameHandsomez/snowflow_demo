attribute position: vec3f;

uniform lightViewProjection: mat4x4f;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
    vertexOutputs.position = uniforms.lightViewProjection * vec4f(input.position, 1.0);
}
