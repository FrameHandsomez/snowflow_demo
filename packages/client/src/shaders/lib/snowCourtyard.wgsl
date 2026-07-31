// -----------------------------------------------------------------------------
// snowCourtyard — flatten the snow terrain inside the shrine courtyard.
//
// The shrine floor is a flat authored pad at padY. The surrounding snow is a
// rolling heightfield. Without this, dunes show through under the ruin and the
// pad floats above / sinks below the visible snow. This include blends both the
// vertex height and the shading normal toward the flat pad inside the courtyard,
// with a soft rim so the pad eases into the dunes rather than cutting a disc.
// -----------------------------------------------------------------------------

/// Courtyard flat weight at a world XZ sample.
/// 1 = fully on the pad, 0 = pure heightfield.
fn courtyardWeight(worldXZ: vec2f, center: vec2f, radius: f32, blend: f32) -> f32 {
    let r = distance(worldXZ, center);
    let inner = radius - blend;
    if (r <= inner) { return 1.0; }
    if (r >= radius) { return 0.0; }
    let t = (r - inner) / blend;
    return 1.0 - t * t * (3.0 - 2.0 * t);
}

/// Flatten a height sample toward the courtyard pad.
fn courtyardFlattenHeight(
    h: f32, worldXZ: vec2f,
    center: vec2f, radius: f32, blend: f32, padY: f32
) -> f32 {
    let w = courtyardWeight(worldXZ, center, radius, blend);
    return mix(h, padY, w);
}

/// Flatten a height-space gradient toward flat ground inside the courtyard.
fn courtyardFlattenGrad(
    grad: vec2f, worldXZ: vec2f,
    center: vec2f, radius: f32, blend: f32
) -> vec2f {
    let w = courtyardWeight(worldXZ, center, radius, blend);
    return mix(grad, vec2f(0.0), w);
}
