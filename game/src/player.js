// player.js — DUSTLINE first-person movement (pure simulation, no THREE).
// One job: turn keyboard input into a fighter's velocity and position on the
// Solar Flats map, with acceleration, crouching, jumping and AABB collision.
// Fixed-step friendly: no allocation inside stepPlayer, no Date/Math.random.

// Movement tuning, metres / metres per second / metres per second squared.
export const MOVE = {
  walk: 4.4,
  crouch: 2.2,
  air: 0.35,
  accel: 42,
  friction: 11,
  jump: 5.2,
  gravity: 14,
};

const HALF = 0.4; // fighter half-width on x and z
const STAND_H = 1.8; // body height standing
const CROUCH_H = 1.2; // body height crouched
const EYE_STAND = 1.62;
const EYE_CROUCH = 1.15;

// Resolve a fighter's AABB against every solid box and the map bounds.
// Pushes the fighter out along the axis of least penetration, so calling it
// after each single-axis move gives per-axis sliding. Landing on top of a
// box (pushed upward) sets f.onGround and zeroes vertical speed.
// bots.js reuses this helper instead of duplicating the resolve code.
export function resolveFighter(f, colliders, bounds) {
  const h = f.crouched ? CROUCH_H : STAND_H;
  if (bounds) {
    if (f.x < bounds.minX + HALF) f.x = bounds.minX + HALF;
    if (f.x > bounds.maxX - HALF) f.x = bounds.maxX - HALF;
    if (f.z < bounds.minZ + HALF) f.z = bounds.minZ + HALF;
    if (f.z > bounds.maxZ - HALF) f.z = bounds.maxZ - HALF;
  }
  if (!colliders) return;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (f.x + HALF <= c.minX || f.x - HALF >= c.maxX) continue;
    if (f.y + h <= c.minY || f.y >= c.maxY) continue;
    if (f.z + HALF <= c.minZ || f.z - HALF >= c.maxZ) continue;
    // Overlap depth on each axis; the smallest one is the exit direction.
    const oxMin = f.x + HALF - c.minX;
    const oxMax = c.maxX - (f.x - HALF);
    const oyMin = f.y + h - c.minY;
    const oyMax = c.maxY - f.y;
    const ozMin = f.z + HALF - c.minZ;
    const ozMax = c.maxZ - (f.z - HALF);
    const px = oxMin < oxMax ? oxMin : oxMax;
    const py = oyMin < oyMax ? oyMin : oyMax;
    const pz = ozMin < ozMax ? ozMin : ozMax;
    if (px <= py && px <= pz) {
      f.x += oxMin < oxMax ? -px : px;
    } else if (pz <= py) {
      f.z += ozMin < ozMax ? -pz : pz;
    } else if (oyMin < oyMax) {
      // Head hit the underside of a box: stop rising.
      f.y -= py;
      if (f.vy > 0) f.vy = 0;
    } else {
      // Feet landed on top of a box: stand on it.
      f.y += py;
      if (f.vy < 0) f.vy = 0;
      f.onGround = true;
    }
  }
}

// Advance one fighter for dt seconds from the current keyboard state.
// keys is a Set of KeyboardEvent.code strings. WASD moves relative to
// f.yaw (forward is -z rotated by yaw); ShiftLeft slow-walks at x0.55;
// ControlLeft crouches; Space jumps when on the ground.
export function stepPlayer(f, dt, keys, colliders, bounds) {
  const crouched = keys.has('ControlLeft');
  f.crouched = crouched;
  f.eye = crouched ? EYE_CROUCH : EYE_STAND;

  // Wish direction in world space. yaw 0 faces -z, so forward is
  // (-sin yaw, -cos yaw) and right is (cos yaw, -sin yaw).
  const sin = Math.sin(f.yaw);
  const cos = Math.cos(f.yaw);
  let wx = 0;
  let wz = 0;
  if (keys.has('KeyW')) { wx += -sin; wz += -cos; }
  if (keys.has('KeyS')) { wx += sin; wz += cos; }
  if (keys.has('KeyD')) { wx += cos; wz += -sin; }
  if (keys.has('KeyA')) { wx += -cos; wz += sin; }
  const wl = Math.sqrt(wx * wx + wz * wz);
  if (wl > 0) { wx /= wl; wz /= wl; }

  let speed = crouched ? MOVE.crouch : MOVE.walk;
  if (keys.has('ShiftLeft')) speed *= 0.55;

  const accel = MOVE.accel * (f.onGround ? 1 : MOVE.air);
  if (wl > 0) {
    // Steer horizontal velocity toward the wish velocity.
    const tx = wx * speed;
    const tz = wz * speed;
    const dx = tx - f.vx;
    const dz = tz - f.vz;
    const dl = Math.sqrt(dx * dx + dz * dz);
    const step = accel * dt;
    if (dl <= step) { f.vx = tx; f.vz = tz; }
    else { f.vx += (dx / dl) * step; f.vz += (dz / dl) * step; }
  } else if (f.onGround) {
    // No input on the ground: friction bleeds speed to a stop.
    const sp = Math.sqrt(f.vx * f.vx + f.vz * f.vz);
    const drop = MOVE.friction * dt;
    if (sp <= drop) { f.vx = 0; f.vz = 0; }
    else { f.vx -= (f.vx / sp) * drop; f.vz -= (f.vz / sp) * drop; }
  }

  if (keys.has('Space') && f.onGround) {
    f.vy = MOVE.jump;
    f.onGround = false;
  }

  f.vy -= MOVE.gravity * dt;

  // Integrate one axis at a time, resolving after each, so the fighter
  // slides along walls instead of sticking in corners.
  f.x += f.vx * dt;
  resolveFighter(f, colliders, bounds);
  f.z += f.vz * dt;
  resolveFighter(f, colliders, bounds);

  // Ground is decided by the y clamp (flat ground) or by landing on a box
  // inside resolveFighter; never carried over from the previous tick, or a
  // fighter walking off a crate edge would keep "ground" while falling.
  f.onGround = false;
  f.y += f.vy * dt;
  if (f.y <= 0) {
    f.y = 0;
    f.vy = 0;
    f.onGround = true;
  } else {
    resolveFighter(f, colliders, bounds);
  }

  f.speed2d = Math.sqrt(f.vx * f.vx + f.vz * f.vz);
}

// Mouse look: dx/dy are raw pointer deltas in pixels.
export function lookPlayer(f, dx, dy) {
  f.yaw -= dx * 0.0022;
  f.pitch -= dy * 0.0022;
  if (f.pitch > 1.45) f.pitch = 1.45;
  if (f.pitch < -1.45) f.pitch = -1.45;
}

// Weapon kick applied to the view; pitch stays inside the look clamp.
export function recoilPlayer(f, pitchKick, yawKick) {
  f.pitch += pitchKick;
  if (f.pitch > 1.45) f.pitch = 1.45;
  if (f.pitch < -1.45) f.pitch = -1.45;
  f.yaw += yawKick;
}
