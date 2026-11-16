// render.js — DUSTLINE rendering: renderer, lights, viewmodel, bots, tracers, impacts, charge.
// One job: everything drawn on screen. Simulation lives in state.js / main.js; this file
// only turns fighter positions into meshes. Pooled tracers and impact bursts: no allocation
// per shot, so the hot loop stays clean.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Module-level scratch, reused every frame — no per-frame allocation in hot loops.
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _c = new THREE.Color();

function mat(color, rough) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough === undefined ? 0.85 : rough, metalness: 0.08 });
}

export function createRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.canvas);
  scene.fog = new THREE.Fog(PALETTE.fog, 18, 46);
  const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
  camera.rotation.order = 'YXZ';
  scene.add(camera); // REQUIRED: a camera-attached viewmodel never renders without this.
  const hemi = new THREE.HemisphereLight(PALETTE.sky, PALETTE.ground, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.1);
  sun.position.set(28, 34, -14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -34; sun.shadow.camera.right = 34;
  sun.shadow.camera.top = 34; sun.shadow.camera.bottom = -34;
  sun.shadow.camera.near = 4; sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  // Warm amber glow over each charge site so both objectives read at a glance.
  const lampA = new THREE.PointLight(PALETTE.accent, 14, 16, 1.6);
  lampA.position.set(-22, 3.4, -16);
  scene.add(lampA);
  const lampB = new THREE.PointLight(PALETTE.accent, 14, 16, 1.6);
  lampB.position.set(22, 3.4, 14);
  scene.add(lampB);
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  return { renderer, scene, camera };
}

export function createViewmodel(camera) {
  const group = new THREE.Group();
  const dark = mat(0x1c1e22, 0.45);
  const mid = mat(0x3a3d44, 0.5);
  const amber = mat(PALETTE.accent, 0.4);
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.46), dark);
  receiver.position.set(0, 0, -0.1);
  group.add(receiver);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.3), mid);
  barrel.position.set(0, 0.02, -0.46);
  group.add(barrel);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.1), dark);
  mag.position.set(0, -0.14, -0.06);
  mag.rotation.x = 0.12;
  group.add(mag);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.09), dark);
  grip.position.set(0, -0.12, 0.12);
  grip.rotation.x = 0.35;
  group.add(grip);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.12), amber);
  sight.position.set(0, 0.09, -0.12);
  group.add(sight);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.3), mid);
  rail.position.set(0, 0.075, -0.2);
  group.add(rail);
  const flashMat = new THREE.MeshBasicMaterial({ color: PALETTE.muzzle, transparent: true, opacity: 0 });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), flashMat);
  flash.position.set(0, 0.02, -0.64);
  group.add(flash);
  const flashLight = new THREE.PointLight(PALETTE.muzzle, 0, 6, 1.8);
  flashLight.position.set(0, 0, -0.6);
  group.add(flashLight);
  group.position.set(0.28, -0.24, -0.5);
  camera.add(group);
  return { group, flash, flashMat, flashLight, kick: 0, bob: 0, reloadDip: 0 };
}

export function updateViewmodel(vm, dt, moving, firing, reloading) {
  if (moving) vm.bob += dt * 9; else vm.bob += dt * 2;
  const sway = moving ? Math.sin(vm.bob) * 0.008 : Math.sin(vm.bob) * 0.002;
  const lift = moving ? Math.abs(Math.cos(vm.bob)) * 0.01 : 0;
  if (firing) vm.kick = 0.09;
  vm.kick = Math.max(0, vm.kick - dt * 0.55);
  vm.reloadDip = reloading ? Math.min(1, vm.reloadDip + dt * 3) : Math.max(0, vm.reloadDip - dt * 3);
  vm.group.position.set(0.28 + sway, -0.24 - lift + vm.reloadDip * 0.12, -0.5 + vm.kick);
  vm.group.rotation.x = vm.kick * 1.4 + vm.reloadDip * 0.5;
  vm.group.rotation.z = vm.reloadDip * 0.25;
  if (vm.flashMat.opacity > 0) {
    vm.flashMat.opacity = Math.max(0, vm.flashMat.opacity - dt * 14);
    vm.flashLight.intensity = vm.flashMat.opacity * 26;
  }
}

// ---- Bots: one Group per fighter, team colour on the torso, userData links meshes back
// to their fighter so the raycaster can tell a head hit (head band) from a body hit.
export function createBotMeshes(scene, bots) {
  const meshes = new Map();
  const hitMeshes = [];
  for (const bot of bots) {
    const g = new THREE.Group();
    const teamCol = bot.team === 'ember' ? PALETTE.ember : PALETTE.sable;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.38), mat(teamCol, 0.8));
    torso.position.y = 1.05;
    torso.castShadow = true;
    torso.userData = { fighter: bot, part: 'body' };
    g.add(torso);
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.42, 0.42), mat(0x22242a, 0.7));
    vest.position.y = 1.18;
    vest.userData = { fighter: bot, part: 'body' };
    g.add(vest);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), mat(0x2c2f36, 0.6));
    head.position.y = 1.78;
    head.castShadow = true;
    head.userData = { fighter: bot, part: 'head' };
    g.add(head);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.05), mat(teamCol, 0.3));
    visor.position.set(0, 1.8, 0.18);
    g.add(visor);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.85, 0.26), mat(0x232529, 0.85));
    legL.position.set(-0.17, 0.43, 0);
    legL.castShadow = true;
    g.add(legL);
    const legR = legL.clone();
    legR.position.x = 0.17;
    g.add(legR);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), mat(0x141518, 0.5));
    gun.position.set(0.22, 1.32, 0.3);
    g.add(gun);
    const flashMat = new THREE.MeshBasicMaterial({ color: PALETTE.muzzle, transparent: true, opacity: 0 });
    const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), flashMat);
    flash.position.set(0.22, 1.32, 0.64);
    g.add(flash);
    g.userData = { legL, legR, flash, flashMat, teamCol };
    hitMeshes.push(torso, vest, head);
    scene.add(g);
    meshes.set(bot.id, g);
  }
  return { meshes, hitMeshes };
}

export function updateBotMeshes(meshes, bots, t) {
  for (const bot of bots) {
    const g = meshes.get(bot.id);
    if (!g) continue;
    g.position.set(bot.x, bot.y, bot.z);
    g.rotation.y = bot.yaw;
    const u = g.userData;
    if (!bot.alive) {
      g.rotation.x = -Math.PI / 2 + 0.12;
      g.position.y = bot.y + 0.18;
      u.flashMat.opacity = 0;
      continue;
    }
    g.rotation.x = 0;
    const moving = bot.speed2d > 0.6;
    const swing = moving ? Math.sin(t * 10 + bot.id.length) * 0.5 : 0;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    // Muzzle flash for ~60 ms after a bot fires.
    const recent = (t - bot.lastShotAt) < 0.06;
    u.flashMat.opacity = recent ? 0.95 : 0;
  }
}

// ---- Tracers: 24 pre-made line segments, reused round-robin, fade in 90 ms.
const TRACERS = 24;
const _tracers = [];
let _tracerIdx = 0;
const _tracerMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });

export function spawnTracer(scene, from, to, color) {
  if (_tracers.length < TRACERS) {
    for (let i = _tracers.length; i < TRACERS; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geo, _tracerMat.clone());
      line.visible = false;
      line.frustumCulled = false;
      scene.add(line);
      _tracers.push({ line, life: 0 });
    }
  }
  const slot = _tracers[_tracerIdx];
  _tracerIdx = (_tracerIdx + 1) % TRACERS;
  const pos = slot.line.geometry.attributes.position.array;
  pos[0] = from.x; pos[1] = from.y; pos[2] = from.z;
  pos[3] = to.x; pos[4] = to.y; pos[5] = to.z;
  slot.line.geometry.attributes.position.needsUpdate = true;
  _c.set(color);
  slot.line.material.color.copy(_c);
  slot.line.material.opacity = 0.9;
  slot.line.visible = true;
  slot.life = 0.09;
}

export function updateTracers(dt) {
  for (const s of _tracers) {
    if (!s.line.visible) continue;
    s.life -= dt;
    if (s.life <= 0) { s.line.visible = false; continue; }
    s.line.material.opacity = Math.max(0, s.life / 0.09) * 0.9;
  }
}

// ---- Impacts: 12 pooled point bursts, 8 sparks each, gravity + fade over 0.4 s.
const BURSTS = 12;
const SPARKS = 8;
const _bursts = [];
let _burstIdx = 0;

export function spawnImpact(scene, point, normal) {
  if (_bursts.length < BURSTS) {
    for (let i = _bursts.length; i < BURSTS; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
      const m = new THREE.PointsMaterial({ color: 0xffc46b, size: 0.07, transparent: true, opacity: 0 });
      const pts = new THREE.Points(geo, m);
      pts.visible = false;
      pts.frustumCulled = false;
      scene.add(pts);
      _bursts.push({ pts, vel: new Float32Array(SPARKS * 3), life: 0 });
    }
  }
  const b = _bursts[_burstIdx];
  _burstIdx = (_burstIdx + 1) % BURSTS;
  const pos = b.pts.geometry.attributes.position.array;
  for (let i = 0; i < SPARKS; i++) {
    pos[i * 3] = point.x; pos[i * 3 + 1] = point.y; pos[i * 3 + 2] = point.z;
    const a = (i / SPARKS) * Math.PI * 2;
    b.vel[i * 3] = Math.cos(a) * 1.6 + normal.x * 2.2;
    b.vel[i * 3 + 1] = 1.4 + (i % 3) * 0.5;
    b.vel[i * 3 + 2] = Math.sin(a) * 1.6 + normal.z * 2.2;
  }
  b.pts.geometry.attributes.position.needsUpdate = true;
  b.pts.material.opacity = 0.95;
  b.pts.visible = true;
  b.life = 0.4;
}

export function updateImpacts(dt) {
  for (const b of _bursts) {
    if (!b.pts.visible) continue;
    b.life -= dt;
    if (b.life <= 0) { b.pts.visible = false; continue; }
    const pos = b.pts.geometry.attributes.position.array;
    for (let i = 0; i < SPARKS; i++) {
      b.vel[i * 3 + 1] -= 9.8 * dt;
      pos[i * 3] += b.vel[i * 3] * dt;
      pos[i * 3 + 1] += b.vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += b.vel[i * 3 + 2] * dt;
    }
    b.pts.geometry.attributes.position.needsUpdate = true;
    b.pts.material.opacity = Math.max(0, b.life / 0.4) * 0.95;
  }
}

// ---- Charge: small dark case, blinking amber light while planted.
export function createChargeMesh(scene) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.24), mat(0x1a1c20, 0.5));
  body.position.y = 0.1;
  body.castShadow = true;
  group.add(body);
  const lampMat = new THREE.MeshBasicMaterial({ color: PALETTE.accent });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), lampMat);
  lamp.position.set(0, 0.24, 0);
  group.add(lamp);
  const light = new THREE.PointLight(PALETTE.accent, 0, 5, 1.8);
  light.position.y = 0.4;
  group.add(light);
  group.visible = false;
  scene.add(group);
  let planted = false;
  return {
    group,
    setPlanted(x, z) { group.position.set(x, 0, z); planted = true; group.visible = true; },
    setVisible(v) { group.visible = v; if (!v) planted = false; },
    update(dt) {
      if (!planted) return;
      const on = (Math.floor(performance.now() / 350) % 2) === 0;
      lampMat.color.set(on ? PALETTE.accent : 0x442200);
      light.intensity = on ? 3 : 0;
    }
  };
}

export function syncCamera(camera, f) {
  camera.position.set(f.x, f.y + f.eye, f.z);
  camera.rotation.set(f.pitch, f.yaw, 0);
}
