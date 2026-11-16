// input.js — DUSTLINE keyboard + mouse input (browser-facing, no THREE).
// One job: collect raw device events into the small state object the fixed
// step simulation reads each tick. The sim owns the meaning of the keys
// (R reload, B/G/E buy keys, digits buy slots); this module only records
// which codes are held and which were tapped since the last tick.

// One-shot taps the sim consumes each tick, so a fast press between two
// ticks is never lost. The sim clears `clicked` and `pressed` after reading.
export function createInput(canvas, onLockChange) {
  const state = {
    keys: new Set(), // KeyboardEvent.code strings currently held down
    firing: false, // left mouse button held (only while pointer locked)
    clicked: false, // left button pressed since the last tick (one-shot)
    pressed: new Set(), // key codes tapped since the last tick (one-shot)
  };

  let lookX = 0;
  let lookY = 0;
  let locked = false;

  function requestLock() {
    try {
      const p = canvas.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    } catch (e) {
      // Pointer lock can be refused right after an unlock; the next click
      // retries, so a failure here is not fatal.
    }
  }

  // Clicking the game view grabs the mouse; the same handler also covers
  // re-locking after Escape released it.
  canvas.addEventListener('click', requestLock);

  document.addEventListener('pointerlockchange', function () {
    locked = document.pointerLockElement === canvas;
    if (!locked) state.firing = false;
    if (typeof onLockChange === 'function') onLockChange(locked);
  });

  // Mouse look only counts while locked, so moving the cursor over menus
  // or the buy screen never turns the view.
  document.addEventListener('mousemove', function (ev) {
    if (!locked) return;
    lookX += ev.movementX || 0;
    lookY += ev.movementY || 0;
  });

  document.addEventListener('mousedown', function (ev) {
    if (!locked || ev.button !== 0) return;
    state.firing = true;
    state.clicked = true;
  });

  document.addEventListener('mouseup', function (ev) {
    if (ev.button !== 0) return;
    state.firing = false;
  });

  document.addEventListener('keydown', function (ev) {
    // Space scrolls the page and Tab moves focus; both are game keys here.
    if (ev.code === 'Space' || ev.code === 'Tab') ev.preventDefault();
    if (ev.repeat) return;
    state.keys.add(ev.code);
    state.pressed.add(ev.code);
  });

  document.addEventListener('keyup', function (ev) {
    state.keys.delete(ev.code);
  });

  // Losing the window drops every key: without this, Alt-Tabbing away while
  // holding W would leave the fighter walking on its own when focus returns.
  window.addEventListener('blur', function () {
    state.keys.clear();
    state.firing = false;
  });

  // Hands the accumulated look deltas to the sim and zeroes them, so each
  // pixel of mouse movement turns the view exactly once.
  function takeLook() {
    const out = { x: lookX, y: lookY };
    lookX = 0;
    lookY = 0;
    return out;
  }

  return { state: state, requestLock: requestLock, takeLook: takeLook };
}
