// bomb.js — DUSTLINE charge: plant (3 s), defuse (5 s), 35 s fuse, pickup.
//
// One function owns the whole charge lifecycle so rounds.js only has to act
// on the word it returns: 'planted' (once, when the plant completes — the
// caller awards +$300), 'detonated', 'defused', or null. Plant and defuse
// progress decay when nobody is working on the charge, so a half-plant
// does not bank. Only the player picks up a dropped charge, and only while
// the round is live and the charge is not planted. Bots never pick it up.

import { siteAt } from './world.js';

const PLANT_TIME = 3; // seconds holding E inside a site to plant
const DEFUSE_TIME = 5; // seconds holding E at the planted charge to defuse
const FUSE_TIME = 35; // seconds from plant to detonation
const PICKUP_RANGE = 1.2; // metres: walk over a dropped charge to take it
const DEFUSE_RANGE = 2.5; // metres: close enough to work on the charge

// Complete a plant for `carrier` at `site`: the charge stays where it was
// planted, the fuse starts, and the carrier's hands are empty again.
function finishPlant(state, world, site, carrier) {
  const c = state.charge;
  c.planted = true;
  c.site = site;
  c.timer = FUSE_TIME;
  c.plantProgress = 0;
  c.defuseProgress = 0;
  c.x = carrier.x;
  c.z = carrier.z;
  c.carrier = null;
  carrier.hasCharge = false;
  carrier.planting = 0;
  return 'planted';
}

export function stepBomb(state, world, dt, inputKeys) {
  if (state.phase !== 'live') return null;
  const c = state.charge;
  const p = state.player;

  // A dropped charge lies where its carrier died until the player walks
  // over it. Bots never pick it up: only the player carries the objective.
  if (!c.planted && !c.carrier && p && p.alive && !p.hasCharge) {
    if (Math.hypot(c.x - p.x, c.z - p.z) < PICKUP_RANGE) {
      c.carrier = 'player';
      p.hasCharge = true;
    }
  }

  if (!c.planted) {
    // Planting: the player holding E inside a site, or an Ember bot holding
    // the charge at its site with no enemy in sight (bots.js sets
    // bot.planting). One worker per tick; progress decays when nobody works.
    let working = false;
    if (p && p.alive && p.hasCharge && inputKeys && inputKeys.has('KeyE')) {
      const site = siteAt(world, p.x, p.z);
      if (site) {
        working = true;
        c.plantProgress += dt / PLANT_TIME;
        if (c.plantProgress >= 1) return finishPlant(state, world, site, p);
      }
    }
    if (!working) {
      for (let i = 0; i < state.bots.length; i++) {
        const bot = state.bots[i];
        if (bot.team !== 'ember' || !bot.alive || !bot.hasCharge || !bot.planting) continue;
        const site = siteAt(world, bot.x, bot.z);
        if (!site) continue;
        working = true;
        c.plantProgress += dt / PLANT_TIME;
        if (c.plantProgress >= 1) return finishPlant(state, world, site, bot);
        break;
      }
    }
    if (!working) c.plantProgress = Math.max(0, c.plantProgress - dt / PLANT_TIME);
    // Mirror the player's own plant progress onto the fighter so the HUD
    // can show the plant bar; 0 when a bot is planting or nobody is.
    if (p) p.planting = working && p.hasCharge && inputKeys && inputKeys.has('KeyE') ? c.plantProgress : 0;
    return null;
  }

  // Planted: the fuse burns down, and either side can end the round.
  c.timer -= dt;
  if (c.timer <= 0) {
    c.timer = 0;
    return 'detonated';
  }
  let working = false;
  if (p && p.alive && inputKeys && inputKeys.has('KeyE')) {
    if (Math.hypot(c.x - p.x, c.z - p.z) < DEFUSE_RANGE) {
      working = true;
      c.defuseProgress += dt / DEFUSE_TIME;
      if (c.defuseProgress >= 1) {
        c.defuseProgress = 0;
        if (p) p.defusing = 0;
        return 'defused';
      }
    }
  }
  if (!working) {
    for (let i = 0; i < state.bots.length; i++) {
      const bot = state.bots[i];
      if (bot.team !== 'sable' || !bot.alive || !bot.defusing) continue;
      if (Math.hypot(c.x - bot.x, c.z - bot.z) >= DEFUSE_RANGE) continue;
      working = true;
      c.defuseProgress += dt / DEFUSE_TIME;
      if (c.defuseProgress >= 1) {
        c.defuseProgress = 0;
        if (p) p.defusing = 0;
        return 'defused';
      }
      break;
    }
  }
  if (!working) c.defuseProgress = Math.max(0, c.defuseProgress - dt / DEFUSE_TIME);
  // Mirror the player's own defuse progress onto the fighter for the HUD.
  if (p) p.defusing = working && inputKeys && inputKeys.has('KeyE') && Math.hypot(c.x - p.x, c.z - p.z) < DEFUSE_RANGE ? c.defuseProgress : 0;
  return null;
}
