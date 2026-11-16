// rounds.js — DUSTLINE round flow, economy and the buy menu catalogue.
// One job: own the phase machine (freeze -> live -> ended), round wins,
// match end, round economy and shop purchases. No rendering here.

import { WEAPONS, giveWeapon } from './weapon.js';

export const FREEZE_TIME = 5;
export const ROUND_TIME = 100;
export const END_TIME = 4;
export const WIN_ROUNDS = 8;
export const MAX_ROUNDS = 15;
export const WIN_BONUS = 3250;
export const LOSE_BONUS = 1900;

export const SHOP = [
  { id: 'ar21', name: 'AR-21 Jackal rifle', price: 2700, desc: 'Long-range automatic rifle' },
  { id: 'sm9', name: 'SM-9 Viper SMG', price: 1500, desc: 'Fast close-range SMG' },
  { id: 'sg12', name: 'SG-12 Breacher shotgun', price: 1900, desc: 'Devastating up close, 8 pellets' },
  { id: 'grenade', name: 'Frag grenade', price: 300, desc: 'One frag grenade (throw with G)' },
  { id: 'armor', name: 'Kevlar armour', price: 650, desc: '+50 armour' },
];

function aliveCount(state, team) {
  let n = 0;
  const all = state.bots || [];
  if (state.player && state.player.team === team && state.player.alive) n += 1;
  for (let i = 0; i < all.length; i += 1) {
    if (all[i].team === team && all[i].alive) n += 1;
  }
  return n;
}

function endRound(state, winner, reason) {
  awardRoundEnd(state, winner, reason);
  state.phase = 'ended';
  state.phaseTime = END_TIME;
  return { type: 'roundEnd', winner, reason };
}

export function startFreeze(state) {
  state.phase = 'freeze';
  state.phaseTime = FREEZE_TIME;
  state.roundWinner = null;
  state.roundReason = '';
  state._awardedRound = -1;
}

export function stepRounds(state, dt, bombResult) {
  if (!state || !(dt > 0)) return null;
  if (state.phase === 'freeze') {
    state.phaseTime -= dt;
    if (state.phaseTime <= 0) {
      state.phase = 'live';
      state.phaseTime = ROUND_TIME;
      state.roundWinner = null;
      state.roundReason = '';
      return { type: 'roundStart', round: state.round };
    }
    return null;
  }
  if (state.phase === 'live') {
    if (bombResult === 'detonated') return endRound(state, 'ember', 'detonation');
    if (bombResult === 'defused') return endRound(state, 'sable', 'defuse');
    const ember = aliveCount(state, 'ember');
    const sable = aliveCount(state, 'sable');
    // Both sides wiped on the same tick: the charge carriers take it.
    if (ember === 0 && sable === 0) return endRound(state, 'ember', 'elimination');
    if (ember === 0) return endRound(state, 'sable', 'elimination');
    if (sable === 0) return endRound(state, 'ember', 'elimination');
    if (!state.charge || !state.charge.planted) {
      state.phaseTime -= dt;
      if (state.phaseTime <= 0) {
        state.phaseTime = 0;
        return endRound(state, 'sable', 'time');
      }
    }
    return null;
  }
  if (state.phase === 'ended') {
    state.phaseTime -= dt;
    if (state.phaseTime <= 0) {
      state.phaseTime = 0;
      const e = state.score.ember;
      const s = state.score.sable;
      if (e >= WIN_ROUNDS || s >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
        const winner = e >= s ? 'ember' : 'sable';
        state.winner = winner;
        return { type: 'matchEnd', winner };
      }
      state.round += 1;
      return { type: 'nextRound', round: state.round };
    }
    return null;
  }
  return null;
}

export function awardRoundEnd(state, winner, reason) {
  if (!state || !winner) return;
  if (state._awardedRound === state.round) return;
  state._awardedRound = state.round;
  state.roundWinner = winner;
  state.roundReason = reason || '';
  if (state.score) state.score[winner] += 1;
  const playerTeam = state.player ? state.player.team : 'ember';
  const bonus = winner === playerTeam ? WIN_BONUS : LOSE_BONUS;
  state.money = (state.money || 0) + bonus;
}

export function buyItem(state, id) {
  if (!state || !state.player || !id) return false;
  let item = null;
  for (let i = 0; i < SHOP.length; i += 1) {
    if (SHOP[i].id === id) item = SHOP[i];
  }
  if (!item) return false;
  if ((state.money || 0) < item.price) return false;
  if (id === 'grenade') {
    if ((state.player.grenades || 0) >= 2) return false;
    state.money -= item.price;
    state.player.grenades = (state.player.grenades || 0) + 1;
    return true;
  }
  if (id === 'armor') {
    if ((state.player.armor || 0) >= 100) return false;
    state.money -= item.price;
    state.player.armor = Math.min(100, (state.player.armor || 0) + 50);
    return true;
  }
  if (!WEAPONS[id]) return false;
  state.money -= item.price;
  giveWeapon(state.player, id);
  return true;
}
