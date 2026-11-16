// DUSTLINE — "Solar Flats": a sun-baked solar-panel farm / desert depot at golden hour.
// Lanes: mid runs straight down x=0 from Ember spawn to the warehouse door and Site A;
// west flanks through the solar field (one clear north-south lane between panel rows);
// east pushes past the container stacks to Site B. Sightlines stay open down mid and
// across both sites, so holding an angle pays and rushing blind does not.
// The layout is hand-placed (no randomness, no RNG), so the map is identical every round.
// Collision rule: fighters are AABBs (half-width 0.4, height 1.8 / 1.2 crouched) resolved
// per-axis against `colliders` + `bounds`; ground is implicit at y=0.

import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const BOUNDS = { minX: -31, maxX: 31, minZ: -23, maxZ: 23 };

// --- material cache: one shared MeshStandardMaterial per flat colour ---
const _mats = new Map();
function mat(color) {
  let m = _mats.get(color);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0.04 }); _mats.set(color, m); }
  return m;
}
const _glowMat = new THREE.MeshStandardMaterial({
  color: PALETTE.accent, emissive: PALETTE.accent, emissiveIntensity: 1.6, roughness: 0.4,
});

// --- build helpers (build-time only; nothing here runs per frame) ---
function box(scene, w, h, d, color, x, y, z, big) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.receiveShadow = true;
  if (big) m.castShadow = true; // shadows only on the big solids, keeps the map cheap
  scene.add(m);
  return m;
}
// Solid box: mesh + AABB collider + bullet target. y is the box centre.
function solid(scene, out, w, h, d, color, x, y, z) {
  const m = box(scene, w, h, d, color, x, y, z, true);
  out.colliders.push({ minX: x - w / 2, minY: y - h / 2, minZ: z - d / 2, maxX: x + w / 2, maxY: y + h / 2, maxZ: z + d / 2 });
  out.shootables.push(m);
  return m;
}
// Flat ground decal: painted, never a collider (feet walk over it at y=0).
function flat(scene, w, d, color, x, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), mat(color));
  m.position.set(x, 0.011, z);
  m.receiveShadow = true;
  scene.add(m);
  return m;
}
function strip(scene, w, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, 0.12), _glowMat);
  m.position.set(x, y, z);
  scene.add(m);
  return m;
}

// Solar panel rows: 3 rows (x = -28, -23.5, -19), 3 panels each (z = -9, -1, 7).
// Each panel is 3 wide (x) by 5.5 long (z), tilted 30 deg about z; tops reach ~2.6 m,
// so they are cover you shoot over and around, never full-height walls. The bounding
// box of the tilted panel is the collider; the 1.8 m lane between rows stays walkable.
const PANEL_ROWS = [-28, -23.5, -19];
const PANEL_ZS = [-9, -1, 7];
const PANEL_HALF_X = 1.34, PANEL_HALF_Y = 0.82, PANEL_HALF_Z = 2.75;

function buildPanels(scene, out) {
  for (const cx of PANEL_ROWS) {
    for (const cz of PANEL_ZS) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(3, 0.15, 5.5), mat(PALETTE.panel));
      m.position.set(cx, 1.8, cz);
      m.rotation.z = Math.PI / 6; // low edge west, high edge east, catching the low sun
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
      out.colliders.push({
        minX: cx - PANEL_HALF_X, minY: 1.8 - PANEL_HALF_Y, minZ: cz - PANEL_HALF_Z,
        maxX: cx + PANEL_HALF_X, maxY: 1.8 + PANEL_HALF_Y, maxZ: cz + PANEL_HALF_Z,
      });
      out.shootables.push(m);
      // Frame posts under the low edge (rust steel, solid).
      for (const pz of [cz - 2.2, cz + 2.2]) {
        solid(scene, out, 0.15, 1.0, 0.15, PALETTE.rustDark, cx - 1.2, 0.5, pz);
      }
    }
  }
}

export function createWorld(scene) {
  const out = { colliders: [], shootables: [], spawns: null, sites: null, routes: null, bounds: BOUNDS };

  // Golden-hour sky: warm haze, sun low from the south-east.
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 45, 110);
  const hemi = new THREE.HemisphereLight(0xffe2b0, PALETTE.groundDark, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a0, 1.7);
  sun.position.set(25, 34, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 32; sun.shadow.camera.bottom = -32;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 95;
  scene.add(sun);

  // Ground: warm sand slab (top at y=0), plus worn darker patches and a concrete
  // apron in front of the warehouse. Patches are paint, not colliders.
  const ground = box(scene, 64, 0.2, 48, PALETTE.ground, 0, -0.1, 0, false);
  out.shootables.push(ground);
  flat(scene, 12, 7, PALETTE.groundDark, -12, 8);
  flat(scene, 10, 6, PALETTE.groundDark, 12, -8);
  flat(scene, 9, 5, PALETTE.groundDark, 4, 14);
  flat(scene, 20, 4, PALETTE.concreteDark, 0, -18);

  // Perimeter walls, height 4, ringing the 64 x 48 yard.
  solid(scene, out, 64, 4, 0.6, PALETTE.concrete, 0, 2, -23.3);
  solid(scene, out, 64, 4, 0.6, PALETTE.concrete, 0, 2, 23.3);
  solid(scene, out, 0.6, 4, 46, PALETTE.concrete, -31.3, 2, 0);
  solid(scene, out, 0.6, 4, 46, PALETTE.concrete, 31.3, 2, 0);

  // Warehouse block north (x -16..16, z -20..-24, height 6): Sable's home, entered
  // only through the door gap (x -0.8..4.8, lintel above y=3). The gap is 0.8 m wider
  // than the nominal 0..4 so the Sable spawn at (0,-20) never starts inside the wall.
  solid(scene, out, 15.2, 6, 0.6, PALETTE.concrete, -8.4, 3, -20);
  solid(scene, out, 11.2, 6, 0.6, PALETTE.concrete, 10.4, 3, -20);
  solid(scene, out, 5.6, 3, 0.6, PALETTE.concrete, 2, 4.5, -20); // door lintel
  solid(scene, out, 0.6, 6, 3.6, PALETTE.concreteDark, -16, 3, -21.8);
  solid(scene, out, 0.6, 6, 3.6, PALETTE.concreteDark, 16, 3, -21.8);
  solid(scene, out, 32, 6, 0.6, PALETTE.concreteDark, 0, 3, -23.3);
  const roof = box(scene, 32.6, 0.3, 3.9, PALETTE.rustDark, 0, 6.15, -21.65, true);
  out.shootables.push(roof);
  strip(scene, 4, 2, 3.4, -19.65); // amber strip light over the door
  // Two timber crates inside the warehouse, clear of the Sable spawns.
  solid(scene, out, 1.5, 1.5, 1.5, PALETTE.wood, -10, 0.75, -22);
  solid(scene, out, 1.5, 1.5, 1.5, PALETTE.wood, 10, 0.75, -22);

  // Solar panel rows west (x -30..-20).
  buildPanels(scene, out);

  // Container stacks east (x 20..30): 6 m boxes, 2.6 m high, two high where stacked.
  // Lower box y centre 1.3, upper 3.9; uppers sit slightly offset so stacks read as stacked.
  solid(scene, out, 6, 2.6, 2.4, PALETTE.containerAmber, 24, 1.3, -10);
  solid(scene, out, 6, 2.6, 2.4, PALETTE.containerGrey, 24.5, 3.9, -10);
  solid(scene, out, 2.4, 2.6, 6, PALETTE.containerTeal, 26, 1.3, 2);
  solid(scene, out, 2.4, 2.6, 6, PALETTE.containerAmber, 26, 3.9, 1.5);
  solid(scene, out, 6, 2.6, 2.4, PALETTE.containerGrey, 27, 1.3, 18);
  solid(scene, out, 6, 2.6, 2.4, PALETTE.containerTeal, 25, 1.3, -18);
  solid(scene, out, 2.4, 2.6, 6, PALETTE.containerTeal, 28, 1.3, 10);
  strip(scene, 5, 24, 1.3, -8.72); // amber strip on the face of the amber stack

  // Mid yard crates: timber boxes 1.2–2.4 m, scattered as mid cover but kept off the
  // x=0 sightline so the long mid angle stays readable end to end.
  const crates = [
    [-6, -2, 2.0], [-7, 5, 1.6], [5, -3, 1.8], [6, 7, 2.2], [-2, 12, 1.4],
    [3, -9, 1.5], [10, -12, 1.8], [-12, 10, 1.6], [-18, -19, 1.8], [18, 10, 1.8],
  ];
  for (const [cx, cz, s] of crates) solid(scene, out, s, s, s, PALETTE.wood, cx, s / 2, cz);

  // Site markers: painted ground decals, amber for Array, teal for Depot.
  flat(scene, 8, 8, PALETTE.accent, -22, -16);
  flat(scene, 5, 1, PALETTE.ember, -22, -16);
  flat(scene, 8, 8, PALETTE.sable, 22, 14);
  flat(scene, 5, 1, PALETTE.ember, 22, 14);

  out.sites = { A: { x: -22, z: -16, r: 4 }, B: { x: 22, z: 14, r: 4 } };

  // Spawns: yaw 0 faces north (-z), yaw PI faces south (+z). Friendlies stand behind
  // the player spawn (Ember +z, Sable -z) so nobody blocks the player's view at spawn.
  // Sable's player spawn sits in the warehouse door gap; Sable bots exit through it.
  out.spawns = {
    ember: [
      { x: 0, z: 20, yaw: 0 },
      { x: -4, z: 22, yaw: 0 },
      { x: -2, z: 22.5, yaw: 0 },
      { x: 2, z: 22.5, yaw: 0 },
      { x: 4, z: 22, yaw: 0 },
    ],
    sable: [
      { x: 0, z: -20, yaw: Math.PI },
      { x: -4, z: -22, yaw: Math.PI },
      { x: -2, z: -22.5, yaw: Math.PI },
      { x: 2, z: -22.5, yaw: Math.PI },
      { x: 4, z: -22, yaw: Math.PI },
    ],
  };

  // Bot routes: waypoint chains from the Ember spawn. Mid goes to Site A down x=0;
  // west threads the solar-field lane (x -25.75, between panel rows) to Site A;
  // east skirts the containers to Site B. Sable bots walk the same chains in reverse
  // (joining the nearest node after leaving through the warehouse door). Nodes sit
  // 4–7 m apart and at least 0.8 m clear of every collider; the west chain needs
  // 11 nodes because its lane entry must stay in the clear band north of the panels.
  const mid = [[0, 20], [0, 14], [0, 8], [0, 2], [0, -4], [-3, -8], [-8, -11], [-14, -13.5], [-18, -15], [-22, -16]];
  const west = [[0, 20], [-6, 17], [-12, 15], [-18, 13], [-22, 12.5], [-25.75, 11], [-25.75, 5], [-25.75, -1], [-25.75, -7], [-25.75, -13], [-22, -16]];
  const east = [[0, 20], [4, 19.5], [8, 19], [12, 18.5], [16, 17.5], [22, 14]];
  const toPts = (list) => list.map(([x, z]) => ({ x, z }));
  out.routes = { mid: toPts(mid), west: toPts(west), east: toPts(east) };

  return out;
}

// Which plant site (if any) covers a ground point: 'A' | 'B' | null.
export function siteAt(world, x, z) {
  for (const key of ['A', 'B']) {
    const s = world.sites[key];
    const dx = x - s.x, dz = z - s.z;
    if (dx * dx + dz * dz <= s.r * s.r) return key;
  }
  return null;
}
