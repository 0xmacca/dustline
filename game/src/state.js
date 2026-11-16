// DUSTLINE — one state store for the whole match, plain data only.
// The simulation runs at a fixed step (TICK = 1/60) and never touches
// THREE; rendering reads this state and nothing else. Armour absorbs
// half of incoming damage, paid 1:1 from armour points, the rest hits
// health. Randomness is seeded (mulberry32) so a round replays exactly.
import { WEAPONS } from './weapon.js';

export const TICK = 1 / 60;

// Seeded RNG: deterministic where it matters (spawns, bot choices).
// Every caller passes its own generator in; the sim never rolls Math.random.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createFighter(id, team, kind) {
  const p11 = WEAPONS.p11;
  return {
    id,
    team, // 'ember' | 'sable'
    kind, // 'player' | 'bot'
    x: 0, y: 0, z: 0,
    vx: 0, vy: 0, vz: 0,
    yaw: 0, pitch: 0,
    eye: 1.62, // camera height above feet (1.15 when crouched)
    health: 100,
    armor: 0,
    alive: true,
    crouched: false,
    onGround: true,
    weapon: 'p11',
    mag: p11.mag,
    reserve: p11.reserve,
    grenades: 0,
    money: 0,
    kills: 0,
    deaths: 0,
    hasCharge: false,
    planting: 0,
    defusing: 0,
    flash: 0,
    lastShotAt: -99,
    speed2d: 0,
  };
}

export function createState() {
  const player = createFighter('player', 'ember', 'player');
  player.hasCharge = true;
  return {
    time: 0,
    round: 1,
    phase: 'freeze', // 'freeze' -> 'live' -> 'ended' -> next 'freeze'
    phaseTime: 5,
    score: { ember: 0, sable: 0 },
    money: 800,
    charge: {
      carrier: 'player', // the player carries the charge at round start
      planted: false,
      site: null, // 'A' | 'B' once planted
      plantProgress: 0,
      defuseProgress: 0,
      timer: 0, // fuse countdown once planted (35 s)
      x: 0,
      z: 0,
    },
    player,
    bots: [], // bots.js fills this at round start
    events: [],
    winner: null,
    roundWinner: null,
    roundReason: '',
  };
}

// Reset a fighter for a fresh round. Armour and match stats (kills/deaths)
// survive; everything else goes back to its spawn defaults. rounds.js
// sets armour and money after calling this.
export function resetFighter(f, spawn) {
  const p11 = WEAPONS.p11;
  f.x = spawn.x;
  f.y = 0;
  f.z = spawn.z;
  f.vx = 0;
  f.vy = 0;
  f.vz = 0;
  f.yaw = spawn.yaw;
  f.pitch = 0;
  f.eye = 1.62;
  f.health = 100;
  f.alive = true;
  f.crouched = false;
  f.onGround = true;
  f.weapon = 'p11';
  f.mag = p11.mag;
  f.reserve = p11.reserve;
  f.grenades = 0;
  f.hasCharge = false;
  f.planting = 0;
  f.defusing = 0;
  f.flash = 0;
  f.lastShotAt = -99;
  f.speed2d = 0;
}

// Armour absorbs half the hit; armour points pay 1:1 for that half,
// so a 40-damage hit against 10 armour spends all 10 armour and deals
// 30 health damage. Returns 'dead' | 'dropped' | 'alive'. A carrier
// who dies drops the charge ('dropped' — the caller moves it to the
// ground at f.x / f.z).
export function damageFighter(f, amount, attacker) {
  if (!f.alive) return 'alive';
  const absorbed = amount * 0.5;
  const spent = Math.min(f.armor, absorbed);
  f.armor -= spent;
  f.health -= amount - spent;
  if (f.health > 0) return 'alive';
  f.health = 0;
  f.alive = false;
  f.deaths += 1;
  if (attacker) attacker.kills += 1;
  if (f.hasCharge) {
    f.hasCharge = false;
    return 'dropped';
  }
  return 'dead';
}

// Newest event first, capped at 5 lines for the HUD feed.
export function pushEvent(state, text) {
  state.events.unshift(text);
  if (state.events.length > 5) state.events.length = 5;
}
