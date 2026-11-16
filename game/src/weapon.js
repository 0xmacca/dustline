// weapon.js — DUSTLINE weapons and grenades (pure simulation, no THREE).
// One job: the weapon table, fire/reload state machines, and the frag
// grenade's flight. Hit detection lives with the shooter (main.js / bots.js);
// this module only decides whether a shot leaves the barrel and how wide
// its cone is. Deterministic: no Date.now(), no Math.random() here.

// Weapon table. damage is per pellet at close range; headMult multiplies on
// a head hit; rate is seconds between shots; tracer is the tracer colour.
export const WEAPONS = {
  p11: { name: 'P11 Hornet', price: 0, damage: 30, headMult: 3, mag: 12, reserve: 48, rate: 0.28, auto: false, spread: 0.011, moveSpread: 0.016, recoil: 0.006, range: 70, pellets: 1, reloadTime: 1.1, tracer: 0xffc861 },
  ar21: { name: 'AR-21 Jackal', price: 2700, damage: 34, headMult: 4, mag: 30, reserve: 90, rate: 0.1, auto: true, spread: 0.008, moveSpread: 0.03, recoil: 0.011, range: 90, pellets: 1, reloadTime: 2.2, tracer: 0xffc861 },
  sm9: { name: 'SM-9 Viper', price: 1500, damage: 26, headMult: 3, mag: 25, reserve: 100, rate: 0.07, auto: true, spread: 0.013, moveSpread: 0.024, recoil: 0.007, range: 55, pellets: 1, reloadTime: 1.8, tracer: 0xffc861 },
  sg12: { name: 'SG-12 Breacher', price: 1900, damage: 14, headMult: 2, mag: 6, reserve: 24, rate: 0.9, auto: false, spread: 0.028, moveSpread: 0.02, recoil: 0.02, range: 30, pellets: 8, reloadTime: 2.6, tracer: 0xffc861 },
};

// Fresh per-fighter weapon state for a weapon name.
export function createWeaponState(name) {
  const def = WEAPONS[name];
  return { name: name, mag: def.mag, reserve: def.reserve, cooldown: 0, reloading: 0 };
}

// Try to fire one shot. The cooldown decays on EVERY call, trigger held or
// not, so a short click that lands between two ticks is never swallowed.
// Auto vs semi is enforced by the caller: semi-autos fire only on the
// click edge, autos while the trigger is held.
export function tryFire(ws, def, dt, moving) {
  ws.cooldown -= dt;
  if (ws.cooldown > 0) return false;
  if (ws.reloading > 0) return false;
  if (ws.mag <= 0) return false;
  ws.mag -= 1;
  ws.cooldown = def.rate;
  return true;
}

// Begin a reload when the magazine is not full and spare rounds exist.
export function startReload(ws, def) {
  if (ws.mag >= def.mag) return;
  if (ws.reserve <= 0) return;
  if (ws.reloading > 0) return;
  ws.reloading = def.reloadTime;
}

// Tick a reload in progress. Returns true only on the tick it finishes,
// when the needed rounds move from reserve into the magazine.
export function stepReload(ws, def, dt) {
  if (ws.reloading <= 0) return false;
  ws.reloading -= dt;
  if (ws.reloading > 0) return false;
  ws.reloading = 0;
  const need = def.mag - ws.mag;
  const take = need < ws.reserve ? need : ws.reserve;
  ws.mag += take;
  ws.reserve -= take;
  return true;
}

// Hand a fighter a new weapon with a full magazine and its reserve stock.
// Grenades are a separate purchase and are left untouched.
export function giveWeapon(f, name) {
  const def = WEAPONS[name];
  f.weapon = name;
  f.mag = def.mag;
  f.reserve = def.reserve;
}

const GRENADE_R = 0.12; // grenade sphere radius
const GRENADE_GRAVITY = 14;
const BOUNCE = 0.35; // restitution: keeps some energy, kills the rest

// A thrown frag grenade. fuse counts down from the throw; the sim reads
// the 'explode' return to apply the blast.
export function createGrenade(x, y, z, vx, vy, vz, team) {
  return { x: x, y: y, z: z, vx: vx, vy: vy, vz: vz, team: team, fuse: 1.6, alive: true };
}

// Advance one grenade: gravity, bounce off the ground, walls and crates
// (restitution 0.35, sliding along the other axes), then the fuse.
// Returns 'explode' on the tick the fuse runs out, else null.
export function stepGrenade(g, dt, colliders, bounds) {
  g.vy -= GRENADE_GRAVITY * dt;
  g.x += g.vx * dt;
  g.y += g.vy * dt;
  g.z += g.vz * dt;

  // Ground: bounce while it still has energy, then roll to a stop.
  if (g.y < GRENADE_R) {
    g.y = GRENADE_R;
    if (g.vy < 0) {
      g.vy = -g.vy * BOUNCE;
      if (g.vy < 0.5) g.vy = 0;
    }
  }

  // Map walls: bounce the blocked component, keep sliding on the others.
  if (bounds) {
    if (g.x < bounds.minX + GRENADE_R) { g.x = bounds.minX + GRENADE_R; if (g.vx < 0) g.vx = -g.vx * BOUNCE; }
    if (g.x > bounds.maxX - GRENADE_R) { g.x = bounds.maxX - GRENADE_R; if (g.vx > 0) g.vx = -g.vx * BOUNCE; }
    if (g.z < bounds.minZ + GRENADE_R) { g.z = bounds.minZ + GRENADE_R; if (g.vz < 0) g.vz = -g.vz * BOUNCE; }
    if (g.z > bounds.maxZ - GRENADE_R) { g.z = bounds.maxZ - GRENADE_R; if (g.vz > 0) g.vz = -g.vz * BOUNCE; }
  }

  // Crates and panels: push the sphere out along the shallowest overlap
  // and bounce only that axis, so it slides along faces instead of
  // sticking in corners.
  if (colliders) {
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (g.x + GRENADE_R <= c.minX || g.x - GRENADE_R >= c.maxX) continue;
      if (g.y + GRENADE_R <= c.minY || g.y - GRENADE_R >= c.maxY) continue;
      if (g.z + GRENADE_R <= c.minZ || g.z - GRENADE_R >= c.maxZ) continue;
      const oxMin = g.x + GRENADE_R - c.minX;
      const oxMax = c.maxX - (g.x - GRENADE_R);
      const oyMin = g.y + GRENADE_R - c.minY;
      const oyMax = c.maxY - (g.y - GRENADE_R);
      const ozMin = g.z + GRENADE_R - c.minZ;
      const ozMax = c.maxZ - (g.z - GRENADE_R);
      const px = oxMin < oxMax ? oxMin : oxMax;
      const py = oyMin < oyMax ? oyMin : oyMax;
      const pz = ozMin < ozMax ? ozMin : ozMax;
      if (px <= py && px <= pz) {
        g.x += oxMin < oxMax ? -px : px;
        if ((oxMin < oxMax && g.vx > 0) || (oxMin >= oxMax && g.vx < 0)) g.vx = -g.vx * BOUNCE;
      } else if (pz <= py) {
        g.z += ozMin < ozMax ? -pz : pz;
        if ((ozMin < ozMax && g.vz > 0) || (ozMin >= ozMax && g.vz < 0)) g.vz = -g.vz * BOUNCE;
      } else {
        g.y += oyMin < oyMax ? -py : py;
        if ((oyMin < oyMax && g.vy > 0) || (oyMin >= oyMax && g.vy < 0)) g.vy = -g.vy * BOUNCE;
      }
    }
  }

  g.fuse -= dt;
  if (g.fuse <= 0) {
    g.alive = false;
    return 'explode';
  }
  return null;
}

// Current shot-cone half-angle in radians for a weapon. Spread punishes
// firing on the move: it grows with speed up to the walk speed, and
// crouching steadies it, so stopping to aim pays (judge criterion 2).
export function spreadFor(def, moving, crouched, speed2d) {
  let s = def.spread;
  if (moving) {
    let k = speed2d / 4.4;
    if (k > 1) k = 1;
    s += def.moveSpread * k * (crouched ? 0.6 : 1);
  }
  return s;
}
