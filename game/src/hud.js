// hud.js — DUSTLINE HUD: mirror match state onto the DOM, build the buy
// menu from SHOP. Updates write textContent / style only, never innerHTML.
import { SHOP } from './rounds.js';

function $(id) {
  return document.getElementById(id);
}

function fmtClock(sec) {
  const s = Math.max(0, Math.ceil(sec || 0));
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return m + ':' + (r < 10 ? '0' + r : '' + r);
}

function setText(el, text) {
  if (el) el.textContent = text;
}

export function createHud() {
  const els = {
    game: $('game'), hud: $('hud'), crosshair: $('crosshair'),
    hitmarker: $('hitmarker'), ammo: $('ammo'), ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'), health: $('health'),
    healthNum: $('health-num'), armorNum: $('armor-num'),
    money: $('money'), score: $('score'), scoreEmber: $('score-ember'),
    scoreSable: $('score-sable'), timer: $('timer'), roundNum: $('round-num'),
    weaponName: $('weapon-name'), killfeed: $('killfeed'),
    bombStatus: $('bomb-status'), overlay: $('overlay'),
    overlayTitle: $('overlay-title'), overlayCopy: $('overlay-copy'),
    play: $('play'), buyPanel: $('buy-panel'), buyItems: $('buy-items'),
    buyMoney: $('buy-money'), banner: $('banner'),
    bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    damageFlash: $('damage-flash'), grenades: $('grenades'), hint: $('hint'),
  };

  let lastMoney = 800;
  let lastBombSite = '';
  let hitTimer = 0;
  let flashTimer = 0;

  // Build the buy menu once, from SHOP (keys handled by main.js).
  if (els.buyItems) {
    for (let i = 0; i < SHOP.length; i += 1) {
      const item = SHOP[i];
      const row = document.createElement('div');
      row.className = 'buy-item';
      const key = document.createElement('span');
      key.className = 'k';
      key.textContent = String(i + 1);
      const name = document.createElement('span');
      name.className = 'n';
      name.textContent = item.name;
      const price = document.createElement('span');
      price.className = 'p';
      price.textContent = '$' + item.price;
      const desc = document.createElement('span');
      desc.className = 'd';
      desc.textContent = item.desc;
      row.appendChild(key);
      row.appendChild(name);
      row.appendChild(price);
      row.appendChild(desc);
      els.buyItems.appendChild(row);
    }
  }

  function show(el, on) {
    if (el) el.style.display = on ? '' : 'none';
  }

  function overlayData(data, fallbackTitle, fallbackCopy) {
    if (typeof data === 'string') return { title: data, copy: '' };
    if (data && typeof data === 'object') {
      return {
        title: data.title || data.heading || fallbackTitle,
        copy: data.copy || data.sub || data.subtitle || data.text || data.reason || fallbackCopy,
      };
    }
    return { title: fallbackTitle, copy: fallbackCopy };
  }

  return {
    setHealth(hp, armor) {
      const h = Math.max(0, Math.round(hp || 0));
      const a = Math.max(0, Math.round(armor || 0));
      setText(els.healthNum, String(h));
      setText(els.armorNum, String(a));
      if (els.health) els.health.style.color = h <= 25 ? '#ff5a4e' : '';
    },
    setAmmo(mag, reserve) {
      setText(els.ammoMag, String(mag == null ? 0 : mag));
      setText(els.ammoReserve, String(reserve == null ? 0 : reserve));
      if (els.ammo) els.ammo.style.color = mag === 0 ? '#ff5a4e' : '';
    },
    setMoney(m) {
      lastMoney = m || 0;
      setText(els.money, '$' + lastMoney);
      setText(els.buyMoney, '$' + lastMoney);
    },
    setScore(e, s) {
      setText(els.scoreEmber, String(e || 0));
      setText(els.scoreSable, String(s || 0));
    },
    setTimer(sec, phase) {
      const label = (phase || 'live').toUpperCase();
      setText(els.timer, fmtClock(sec) + ' ' + label);
    },
    setRound(n) {
      setText(els.roundNum, String(n || 1));
    },
    setWeapon(name) {
      setText(els.weaponName, name || '');
    },
    showOverlay(kind, data) {
      if (kind === 'buy') {
        this.showBuy(true);
        return;
      }
      if (els.buyPanel) els.buyPanel.classList.remove('open');
      if (els.banner) els.banner.classList.toggle('show', kind === 'end');
      show(els.overlay, kind !== 'end');
      show(els.play, kind === 'start' || kind === 'paused');
      let d;
      if (kind === 'start') {
        d = overlayData(data, 'DUSTLINE',
          'WASD move, mouse aim, click shoot, R reload, G grenade, B buy. Plant the charge at A or B.');
        if (els.play) els.play.textContent = 'PLAY';
      } else if (kind === 'paused') {
        d = overlayData(data, 'PAUSED', 'Click to resume the match.');
        if (els.play) els.play.textContent = 'RESUME';
      } else if (kind === 'end') {
        const w = data && data.winner ? String(data.winner).toUpperCase() : 'EMBER';
        d = overlayData(data, w + ' WINS THE ROUND', '');
        setText(els.bannerTitle, d.title);
        setText(els.bannerSub, d.copy);
      } else if (kind === 'match') {
        const w = data && data.winner ? String(data.winner).toUpperCase() : 'EMBER';
        d = overlayData(data, w + ' WINS THE MATCH', '');
      } else {
        d = overlayData(data, 'DUSTLINE', '');
      }
      setText(els.overlayTitle, d.title);
      setText(els.overlayCopy, d.copy);
    },
    hideOverlay() {
      show(els.overlay, false);
      if (els.banner) els.banner.classList.remove('show');
      if (els.buyPanel) els.buyPanel.classList.remove('open');
    },
    hitMarker(kill, holdMs) {
      if (!els.hitmarker) return;
      els.hitmarker.style.display = '';
      els.hitmarker.style.opacity = '1';
      els.hitmarker.style.color = kill ? '#ff3b30' : '#ffffff';
      if (hitTimer) clearTimeout(hitTimer);
      hitTimer = setTimeout(function () {
        els.hitmarker.style.opacity = '0';
      }, holdMs || 120);
    },
    killfeed(text) {
      if (!els.killfeed || !text) return;
      const line = document.createElement('div');
      line.className = 'killfeed-line';
      line.textContent = text;
      els.killfeed.prepend(line);
      while (els.killfeed.children.length > 5) {
        els.killfeed.removeChild(els.killfeed.lastChild);
      }
    },
    bombStatus(text) {
      const t = text || '';
      const m = /SITE\s+([AB])/i.exec(t);
      if (m) lastBombSite = m[1].toUpperCase();
      setText(els.bombStatus, t);
    },
    showBuy(showIt) {
      if (els.buyPanel) els.buyPanel.classList.toggle('open', !!showIt);
      if (showIt) setText(els.buyMoney, '$' + lastMoney);
    },
    setSpread(px) {
      if (!els.crosshair) return;
      const s = 1 + Math.max(0, px || 0) / 40;
      els.crosshair.style.transform = 'translate(-50%, -50%) scale(' + s.toFixed(3) + ')';
    },
    damageFlash() {
      if (!els.damageFlash) return;
      els.damageFlash.style.opacity = '0.55';
      if (flashTimer) clearTimeout(flashTimer);
      flashTimer = setTimeout(function () {
        els.damageFlash.style.opacity = '0';
      }, 140);
    },
    setBombTimer(sec) {
      if (sec == null) return;
      const site = lastBombSite ? ' — SITE ' + lastBombSite : '';
      setText(els.bombStatus, 'CHARGE PLANTED' + site + ' — ' + Math.ceil(sec) + 's');
    },
  };
}
