// DUSTLINE palette — Solar Flats at golden hour: warm sand, teal panels, amber steel.
// Render turns these numbers into THREE.Color; simulation code never imports three.
// These exact values are the shared contract: world.js and render.js both read them.

export const PALETTE = {
  // Atmosphere: backdrop the player looks at, and the haze that softens the far wall.
  canvas: 0x2a2018, sky: 0xf2c98a, fog: 0xe8c48f,
  // Ground: sun-baked sand yard, with a darker worn patch tone for variation.
  ground: 0xb59a6a, groundDark: 0x8a744e,
  // Built structures: pale warehouse concrete and its shaded faces.
  concrete: 0xa89a82, concreteDark: 0x7d7264,
  // Solar panels: dark teal glass faces on charcoal frames.
  panel: 0x1e6b66, panelFrame: 0x3a3f45,
  // Rust and wear: weathered steel trim, door frames, panel posts.
  rust: 0xb05a28, rustDark: 0x7e3f1c,
  // Shipping containers: amber, teal and grey stacks on the east yard.
  containerAmber: 0xc07a2a, containerTeal: 0x2e6f6a, containerGrey: 0x6a7076,
  // Crates: plain timber boxes scattered as mid cover.
  wood: 0x6b4a2f,
  // UI and markers: amber accent, bright ink for text, soft muted tone for dim labels.
  accent: 0xf0a830, ink: 0xf5efe4, muted: 0xcfc8b8,
  // Teams: Ember attackers read amber, Sable defenders read teal.
  ember: 0xf0a830, sable: 0x35b5b0,
  // Gunfire: warm muzzle flash and per-team tracer streaks.
  muzzle: 0xffd27a, tracerEmber: 0xffc861, tracerSable: 0x7ae0d8,
};
