// main.js — DUSTLINE boot + loop. Fixed-step sim (1/60) apart from rendering; one
// state store (state.js); one-job modules; pooled tracers/impacts (render.js).
import * as THREE from 'three';
import { TICK, createState, resetFighter, damageFighter, pushEvent } from './state.js';
import { createWorld } from './world.js';
import { stepPlayer, lookPlayer, recoilPlayer } from './player.js';
import { WEAPONS, createWeaponState, tryFire, startReload, stepReload, giveWeapon, createGrenade, stepGrenade, spreadFor } from './weapon.js';
import { createBot, assignRound, stepBot, resetBot, hearNoise } from './bots.js';
import { stepBomb } from './bomb.js';
import { SHOP, startFreeze, stepRounds, awardRoundEnd, buyItem } from './rounds.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, createViewmodel, updateViewmodel, createBotMeshes, updateBotMeshes, spawnTracer, updateTracers, spawnImpact, updateImpacts, createChargeMesh, syncCamera } from './render.js';
import { PALETTE } from './palette.js';

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const params = new URLSearchParams(location.search);
const seed = parseInt(params.get('seed') || '1337', 10) || 1337;
const shotMode = params.get('shot') || null;
const rng = mulberry32(seed);

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();
const _v = new THREE.Vector3();
const _e = new THREE.Vector3();
const _n = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

const { renderer, scene, camera } = createRenderer();
document.getElementById('game').appendChild(renderer.domElement);
const world = createWorld(scene);
const state = createState();
const player = state.player;
const hud = createHud();
const audio = createAudio();
let sawLock = false;
const input = createInput(renderer.domElement, (locked) => {
  if (locked) { sawLock = true; hud.hideOverlay(); audio.init(); }
  else if (sawLock && !shotMode && state.phase === 'live') { hud.showOverlay('paused'); }
});
const vm = createViewmodel(camera);
const chargeMesh = createChargeMesh(scene);
const ray = new THREE.Raycaster();

const bots = [];
for (let i = 0; i < 4; i++) bots.push(createBot('ember-' + (i + 1), 'ember', world.spawns.ember[i + 1], ['planter', 'rifler', 'rifler', 'holder'][i]));
for (let i = 0; i < 5; i++) bots.push(createBot('sable-' + (i + 1), 'sable', world.spawns.sable[i], ['holder', 'holder', 'holder', 'holder', 'rifler'][i]));
state.bots = bots;
assignRound(bots, state, world, rng);
const botMeshes = createBotMeshes(scene, bots);
const hitMeshes = botMeshes.hitMeshes;
const targets = world.shootables.concat(hitMeshes);

let ws = createWeaponState(player.weapon || 'p11');
const owned = new Set(['p11']);
const grenades = [];
let buyOpen = state.phase === 'freeze';
let vmFired = false;

function los(ax, ay, az, bx, by, bz) {
  _o.set(ax, ay, az);
  _d.set(bx - ax, by - ay, bz - az);
  const dist = _d.length();
  if (dist < 0.01) return true;
  _d.multiplyScalar(1 / dist);
  ray.set(_o, _d);
  ray.far = dist;
  return ray.intersectObjects(world.shootables, false).length === 0;
}

function resolveShot(from, dir, range) {
  ray.set(from, dir);
  ray.far = range;
  const hits = ray.intersectObjects(targets, false);
  if (!hits.length) return null;
  const h = hits[0];
  const ud = h.object.userData || {};
  return { point: h.point, fighter: ud.fighter || null, part: ud.part || null, dist: h.distance };
}

function tracerEnd(from, dir, range, hit) {
  if (hit) return hit.point;
  return _e.copy(dir).multiplyScalar(range).add(from);
}

function onKill(victim, killer) {
  if (killer === player) {
    state.money += 300;
    player.money = state.money;
    hud.killfeed('You ▸ ' + victim.id);
    pushEvent(state, 'You ▸ ' + victim.id);
    audio.kill();
  } else if (victim === player) {
    hud.killfeed(killer.id + ' ▸ You');
    audio.hurt();
  } else {
    hud.killfeed(killer.id + ' ▸ ' + victim.id);
  }
}

function applyShotDamage(shooter, hit, w) {
  const f = hit.fighter;
  if (!f || !f.alive || f === shooter || f.team === shooter.team) return false;
  const head = hit.part === 'head';
  const res = damageFighter(f, w.damage * (head ? w.headMult : 1), shooter);
  const died = (res === 'dead' || res === 'dropped');
  if (res === 'dropped') {
    state.charge.x = f.x;
    state.charge.z = f.z;
    state.charge.carrier = null;
  }
  if (shooter === player) {
    hud.hitMarker(died);
    if (died) onKill(f, player); else audio.hit(head);
  } else if (f === player) {
    hud.damageFlash();
    audio.hurt();
    if (died) onKill(f, shooter);
  } else if (died) {
    hud.killfeed(shooter.id + ' ▸ ' + f.id);
  }
  return true;
}

function playerShoot() {
  const w = WEAPONS[player.weapon];
  if (!w) return;
  const spread = spreadFor(w, player.speed2d > 0.5, player.crouched, player.speed2d);
  _o.set(player.x, player.y + player.eye, player.z);
  camera.getWorldDirection(_d);
  const pellets = w.pellets || 1;
  const range = w.range || 90;
  for (let p = 0; p < pellets; p++) {
    _r.crossVectors(_d, _up).normalize();
    _u.crossVectors(_r, _d).normalize();
    _v.copy(_d)
      .addScaledVector(_r, (rng() * 2 - 1) * spread)
      .addScaledVector(_u, (rng() * 2 - 1) * spread).normalize();
    const hit = resolveShot(_o, _v, range);
    spawnTracer(scene, _o, tracerEnd(_o, _v, range, hit), PALETTE.tracerEmber);
    if (hit && hit.fighter) applyShotDamage(player, hit, w);
    else if (hit) spawnImpact(scene, hit.point, _n.copy(_v).negate());
  }
  recoilPlayer(player, w.recoil, (rng() - 0.5) * w.recoil * 0.4);
  vm.flashMat.opacity = 1;
  vm.flashLight.intensity = 26;
  vmFired = true;
  audio.shot(player.weapon);
  hearNoise(player.x, player.z, 1, player.team, state.time);
}

function botShootAt(bot, tx, ty, tz, spread) {
  const w = WEAPONS[bot.weapon] || WEAPONS.p11;
  _o.set(bot.x, bot.y + bot.eye, bot.z);
  _d.set(tx - bot.x, ty - (bot.y + bot.eye), tz - bot.z);
  const dist = _d.length();
  if (dist < 0.01) return;
  _d.multiplyScalar(1 / dist);
  _r.crossVectors(_d, _up).normalize();
  _u.crossVectors(_r, _d).normalize();
  _v.copy(_d)
    .addScaledVector(_r, (rng() * 2 - 1) * spread)
    .addScaledVector(_u, (rng() * 2 - 1) * spread).normalize();
  const range = w.range || 90;
  const hit = resolveShot(_o, _v, range);
  bot.lastShotAt = state.time;
  spawnTracer(scene, _o, tracerEnd(_o, _v, range, hit), bot.team === 'ember' ? PALETTE.tracerEmber : PALETTE.tracerSable);
  if (hit && hit.fighter) applyShotDamage(bot, hit, w);
  else if (hit) spawnImpact(scene, hit.point, _n.copy(_v).negate());
}

const ctx = {
  los,
  shootAt: botShootAt,
  rng
};

function throwGrenade() {
  if (player.grenades <= 0) return;
  player.grenades--;
  camera.getWorldDirection(_d);
  grenades.push(createGrenade(player.x, player.y + player.eye - 0.2, player.z, _d.x * 15, _d.y * 15 + 3.5, _d.z * 15, player.team));
  audio.click();
}

function explodeGrenade(g) {
  audio.explosion();
  hearNoise(g.x, g.z, 1, player.team, state.time);
  spawnImpact(scene, _v.set(g.x, g.y, g.z), _n.set(0, 1, 0));
  for (const f of [player, ...bots]) {
    if (!f.alive) continue;
    const dx = f.x - g.x, dy = (f.y + 1) - g.y, dz = f.z - g.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist >= 6) continue;
    let dmg = 90 * (1 - dist / 6);
    if (!los(g.x, g.y, g.z, f.x, f.y + 1, f.z)) dmg *= 0.5;
    const res = damageFighter(f, dmg, player);
    if (res === 'dead') onKill(f, player);
  }
}

function equip(id) {
  player.weapon = id;
  ws = createWeaponState(id);
  player.mag = ws.mag;
  player.reserve = ws.reserve;
  const w = WEAPONS[id];
  hud.setWeapon((w && w.name) || id);
}

function buyShop(i) {
  const item = SHOP[i];
  if (!item) return;
  const id = item.id || item.key;
  if (!buyItem(state, id)) { audio.dry(); return; }
  audio.click();
  if (WEAPONS[id]) { owned.add(id); giveWeapon(player, id); equip(id); }
  hud.setMoney(state.money);
  hud.showBuy(true, SHOP, state.money);
}

function handleKey(k) {
  const w = WEAPONS[player.weapon];
  if (k === 'KeyR') { startReload(ws, w); audio.reload(); return; }
  if (k === 'KeyG') { throwGrenade(); return; }
  if (k === 'KeyB' && state.phase === 'freeze') {
    buyOpen = !buyOpen;
    hud.showBuy(buyOpen, SHOP, state.money);
    audio.click();
    return;
  }
  if (k.indexOf('Digit') === 0) {
    const n = +k.slice(5);
    if (state.phase === 'freeze') {
      if (n >= 1 && n <= SHOP.length) buyShop(n - 1);
      return;
    }
    if (state.phase === 'live') {
      const order = ['p11', 'ar21', 'sm9', 'sg12'];
      if (n >= 1 && n <= 4 && owned.has(order[n - 1])) equip(order[n - 1]);
      else if (n === 5) throwGrenade();
    }
  }
}

function handleRoundEvent(ev) {
  if (ev.type === 'roundStart') {
    buyOpen = false;
    hud.showBuy(false);
    hud.hideOverlay();
    return;
  }
  if (ev.type === 'roundEnd') {
    awardRoundEnd(state, ev.winner, ev.reason);
    const win = ev.winner === 'ember';
    const reasonText = ev.reason === 'elimination' ? 'Enemy team eliminated'
      : ev.reason === 'detonation' ? 'Charge detonated'
      : ev.reason === 'defuse' ? 'Charge defused'
      : ev.reason === 'time' ? 'Time expired — defenders hold'
      : (ev.reason || '');
    hud.showOverlay('end', { winner: ev.winner, title: win ? 'EMBER TAKES THE ROUND' : 'SABLE HOLDS THE ROUND', copy: reasonText });
    if (win) audio.roundWin(); else audio.roundLose();
    return;
  }
  if (ev.type === 'nextRound') {
    hud.hideOverlay();
    resetFighter(player, world.spawns.ember[0]);
    player.money = state.money;
    bots.forEach((b, i) => {
      const sp = b.team === 'ember' ? world.spawns.ember[(i % 4) + 1] : world.spawns.sable[i - 4];
      resetBot(b, sp, b.role);
    });
    owned.clear();
    owned.add('p11');
    player.hasCharge = true;
    Object.assign(state.charge, { carrier: 'player', planted: false, site: null, plantProgress: 0, defuseProgress: 0, timer: 0, x: 0, z: 0 });
    ws = createWeaponState(player.weapon);
    player.mag = ws.mag;
    player.reserve = ws.reserve;
    grenades.length = 0;
    assignRound(bots, state, world, rng);
    startFreeze(state);
    buyOpen = true;
    hud.showBuy(true, SHOP, state.money);
    chargeMesh.setVisible(false);
    return;
  }
  if (ev.type === 'matchEnd') {
    const win = state.score.ember > state.score.sable;
    hud.showOverlay('match', { winner: win ? 'ember' : 'sable', title: win ? 'EMBER WINS THE MATCH' : 'SABLE WINS THE MATCH', copy: 'Final score ' + state.score.ember + ' — ' + state.score.sable });
    if (win) audio.roundWin(); else audio.roundLose();
  }
}

function stepSim(dt) {
  state.time += dt;
  const look = input.takeLook();
  if (look && (look.x || look.y)) lookPlayer(player, look.x, look.y);
  const pressed = input.state.pressed;
  if (pressed.size) { for (const k of pressed) handleKey(k); pressed.clear(); }
  // Cooldown decays every tick; tryFire (dt=0) only consumes when ready.
  const w = WEAPONS[player.weapon];
  const live = state.phase === 'live';
  const wantFire = live && (w.auto ? input.state.firing : input.state.clicked);
  ws.cooldown = Math.max(0, ws.cooldown - dt);
  if (wantFire && tryFire(ws, w, 0, player.speed2d > 0.5)) playerShoot();
  else if (wantFire && !w.auto && ws.mag <= 0) audio.dry();
  input.state.clicked = false;
  stepReload(ws, w, dt);
  player.mag = ws.mag;
  player.reserve = ws.reserve;
  if (state.phase !== 'ended') stepPlayer(player, dt, input.state.keys, world.colliders, world.bounds);
  if (live) {
    for (const b of bots) if (b.alive) stepBot(b, state, world, dt, ctx);
  }
  for (let i = grenades.length - 1; i >= 0; i--) {
    if (stepGrenade(grenades[i], dt, world.colliders, world.bounds) === 'explode') {
      explodeGrenade(grenades[i]);
      grenades.splice(i, 1);
    }
  }
  const bombResult = stepBomb(state, world, dt, input.state.keys);
  const ev = stepRounds(state, dt, bombResult);
  if (ev) handleRoundEvent(ev);
  if (state.charge.planted) chargeMesh.setPlanted(state.charge.x, state.charge.z);
  else chargeMesh.setVisible(false);
  audio.step(dt);
}

const lastHud = { hp: -1, ar: -1, mg: -1, rv: -1, mo: -1, sc: '', ti: -1, ro: -1, wp: '', gr: -1 };
function syncHud() {
  const hp = Math.ceil(player.health), ar = Math.ceil(player.armor);
  if (hp !== lastHud.hp || ar !== lastHud.ar) { hud.setHealth(hp, ar); lastHud.hp = hp; lastHud.ar = ar; }
  if (player.mag !== lastHud.mg || player.reserve !== lastHud.rv) { hud.setAmmo(player.mag, player.reserve); lastHud.mg = player.mag; lastHud.rv = player.reserve; }
  if (state.money !== lastHud.mo) { hud.setMoney(state.money); lastHud.mo = state.money; }
  const sc = state.score.ember + '-' + state.score.sable;
  if (sc !== lastHud.sc) { hud.setScore(state.score.ember, state.score.sable); lastHud.sc = sc; }
  const t = Math.max(0, Math.ceil(state.phaseTime));
  if (t !== lastHud.ti) { hud.setTimer(t, state.phase); lastHud.ti = t; }
  if (state.round !== lastHud.ro) { hud.setRound(state.round); lastHud.ro = state.round; }
  const wn = (WEAPONS[player.weapon] || {}).name || player.weapon;
  if (wn !== lastHud.wp) { hud.setWeapon(wn); lastHud.wp = wn; }
  if (player.grenades !== lastHud.gr) {
    const el = document.getElementById('grenades');
    if (el) el.textContent = 'Grenades: ' + player.grenades;
    lastHud.gr = player.grenades;
  }
  hud.setSpread(spreadFor(WEAPONS[player.weapon], player.speed2d > 0.5, player.crouched, player.speed2d) * 1200);
  if (state.phase === 'ended') hud.bombStatus('');
  else if (state.charge.planted) hud.setBombTimer(state.charge.timer);
  else if (player.hasCharge) hud.bombStatus('CARRYING THE CHARGE — PLANT AT SITE A OR B (HOLD E)');
  else if (state.charge.carrier) hud.bombStatus('CHARGE WITH ' + state.charge.carrier);
  else hud.bombStatus('CHARGE DROPPED — WALK OVER IT TO PICK IT UP');
}

// Shot mode (?shot=cover|buy|plant|win&seed=N): scripted frames for screenshots.
// After two renders __shotReady is set and the loop freezes.
function setupShot() {
  hud.hideOverlay();
  if (shotMode === 'buy') {
    state.phase = 'freeze'; state.phaseTime = 5;
    buyOpen = true;
    hud.showBuy(true, SHOP, state.money);
  } else if (shotMode === 'cover') {
    state.phase = 'live'; state.phaseTime = 62;
    player.x = 0; player.y = 0; player.z = 24; player.yaw = 0; player.pitch = 0;
    const foe = bots[4];
    foe.x = 1.5; foe.y = 0; foe.z = 10; foe.yaw = Math.PI; foe.alive = true; foe.health = 100;
    bots.forEach((b, i) => { if (b !== foe) { b.x = -14 + i * 6; b.z = -8 - (i % 3) * 6; b.yaw = 0; } });
  } else if (shotMode === 'plant') {
    state.phase = 'live'; state.phaseTime = 55;
    Object.assign(state.charge, { planted: true, site: 'A', timer: 35, x: -22, z: -16 });
    chargeMesh.setPlanted(-22, -16);
    player.x = -17; player.y = 0; player.z = -11; player.yaw = Math.PI * 0.25; player.pitch = 0;
  } else if (shotMode === 'win') {
    state.phase = 'ended'; state.phaseTime = 4;
    state.score.ember = 1; state.roundWinner = 'ember';
    player.hasCharge = false;
    Object.assign(state.charge, { carrier: null, planted: false, site: 'A', plantProgress: 0, defuseProgress: 0, timer: 0, x: -22, z: -16 });
    hud.showOverlay('end', { winner: 'ember', title: 'EMBER TAKES THE ROUND', copy: 'Charge detonated — Site A cleared' });
  }
  syncCamera(camera, player);
}

const playBtn = document.getElementById('play');
if (playBtn) playBtn.addEventListener('click', () => { audio.init(); input.requestLock(); hud.hideOverlay(); });
if (state.phase === 'freeze') hud.showBuy(true, SHOP, state.money);
if (shotMode) setupShot();

let last = performance.now(), acc = 0, frames = 0, shotDone = false;
function animate(now) {
  if (shotDone) return;
  requestAnimationFrame(animate);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  let n = 0;
  while (acc >= TICK && n < 5) { stepSim(TICK); acc -= TICK; n++; }
  if (n === 5) acc = 0;
  syncCamera(camera, player);
  updateBotMeshes(botMeshes.meshes, bots, state.time);
  updateViewmodel(vm, dt, player.speed2d > 0.6, vmFired, !!(ws && ws.reloading));
  vmFired = false;
  updateTracers(dt);
  updateImpacts(dt);
  chargeMesh.update(dt);
  syncHud();
  renderer.render(scene, camera);
  frames++;
  if (shotMode && frames >= 2) { shotDone = true; window.__shotReady = true; }
}
requestAnimationFrame(animate);
