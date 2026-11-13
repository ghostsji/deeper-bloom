import * as THREE from 'three';
import { floorY, SURFACE_Y, WORLD_RADIUS } from './world.js';
import { perk } from './progress.js';

// ---- Swimming and walking: tune here ------------------------------------------
const SWIM = {
  accel: 14,         // m/s² when holding a direction
  dashMult: 2.2,     // Shift
  drag: 2.6,         // water resistance: higher stops you sooner
  look: 0.0022,      // mouse sensitivity (radians per pixel)
  keyTurn: 2,        // Q/E turn speed (radians per second)
  steerWithView: true, // momentum turns with the camera, so you keep moving (and aiming) where you look
  eye: 1.1,          // closest the camera gets to the seafloor
  float: 0.35,       // how far your eyes sit above the water when treading at the surface
  climb: 1.6,        // swim this close under a raft and you climb onto it
  stunSink: 7,       // m/s² pulling you down while stunned (a shock from the cracked glass)
  stunLook: 0.15,    // how much of your mouse movement still turns the view while stunned
};
const WALK = {
  accel: 40,
  drag: 9,
  dashMult: 1.7,
  gravity: 18,
  jump: 5.5,
  eye: 1.6,          // eye height above the deck
};

// First-person swimmer: mouse-look yaw/pitch, WASD moves along where you look (so looking
// down and pressing W dives), Space and Ctrl (or C) rise and sink straight up and down, Q and E turn.
// At the surface you tread water; on a raft you walk, with gravity and Space to jump.
export function createPlayer(camera, canvas) {
  let yaw = 0, pitch = -0.12;
  const vel = new THREE.Vector3();
  const keys = new Set();
  let onFoot = false, grounded = false;
  let stun = 0, stunMax = 1; // seconds left stunned: no control, and you sink
  let deckAt = () => null; // (x, z) => deck surface height, or null over open water
  // Fallback for when pointer lock isn't available: the free cursor looks around, and
  // resting it near a screen edge keeps turning that way.
  let cursorLook = false;
  const cursor = { x: 0.5, y: 0.5, in: false };

  const onKey = (down) => (e) => {
    // Tab, and Ctrl combos (Ctrl sinks, so Ctrl+W must not reach the browser where it can be stopped).
    if (e.code === 'Tab' || (down && e.ctrlKey && e.code !== 'KeyR')) e.preventDefault();
    if (down) keys.add(e.code); else keys.delete(e.code);
  };
  addEventListener('keydown', onKey(true));
  addEventListener('keyup', onKey(false));
  addEventListener('blur', () => keys.clear());

  const mouse = { sens: 1, invertY: false };
  const look = (dx, dy) => {
    const oldYaw = yaw, oldPitch = pitch;
    yaw -= dx * SWIM.look;
    pitch = THREE.MathUtils.clamp(pitch - dy * SWIM.look, -1.45, 1.45);
    if (!SWIM.steerWithView) return;
    if (onFoot) {
      // On a deck only turning left and right carries your stride round; falls stay falls.
      _steer.set(0, 1, 0);
      const vy = vel.y;
      vel.y = 0;
      vel.applyAxisAngle(_steer, yaw - oldYaw);
      vel.y = vy;
    } else {
      // Swimming: re-express your velocity from the old view in the new one.
      _qOld.setFromEuler(_eSteer.set(oldPitch, oldYaw, 0, 'YXZ')).invert();
      _qNew.setFromEuler(_eSteer.set(pitch, yaw, 0, 'YXZ'));
      vel.applyQuaternion(_qOld).applyQuaternion(_qNew);
    }
  };
  addEventListener('mousemove', (e) => {
    cursor.x = e.clientX / innerWidth; cursor.y = e.clientY / innerHeight; cursor.in = true;
    // Settings → Controls: look sensitivity and invert Y apply to the mouse only (not Q/E).
    const k = mouse.sens * (stun > 0 ? SWIM.stunLook : 1);
    if (document.pointerLockElement === canvas || cursorLook) look(e.movementX * k, e.movementY * k * (mouse.invertY ? -1 : 1));
  });
  document.addEventListener('mouseleave', () => { cursor.in = false; });
  // Clicking the view retries the lock (it works in a normal browser tab, not in embedded ones).
  canvas.addEventListener('click', () => {
    if (cursorLook) Promise.resolve(canvas.requestPointerLock()).catch(() => {});
  });

  const EDGE = 0.08, EDGE_TURN = 1.6; // edge zone (fraction of screen), turn speed (rad/s)
  const edgePush = (v) => (v < EDGE ? (v - EDGE) / EDGE : v > 1 - EDGE ? (v - 1 + EDGE) / EDGE : 0);

  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), wish = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  let sway = 0;

  function readInput(flat) {
    wish.set(0, 0, 0);
    if (stun > 0) return false; // stunned: your limbs won't answer
    const f = flat ? _flatFwd.set(-Math.sin(yaw), 0, -Math.cos(yaw)) : fwd;
    const r = flat ? _flatRight.set(Math.cos(yaw), 0, -Math.sin(yaw)) : right;
    if (keys.has('KeyW') || keys.has('ArrowUp')) wish.add(f);
    if (keys.has('KeyS') || keys.has('ArrowDown')) wish.sub(f);
    if (keys.has('KeyD') || keys.has('ArrowRight')) wish.add(r);
    if (keys.has('KeyA') || keys.has('ArrowLeft')) wish.sub(r);
    if (!flat) {
      if (keys.has('Space')) wish.y += 1;
      if (keys.has('KeyC') || keys.has('ControlLeft') || keys.has('ControlRight')) wish.y -= 1;
    }
    if (wish.lengthSq() > 0) wish.normalize();
    return keys.has('ShiftLeft') || keys.has('ShiftRight');
  }

  function swim(dt, t, p) {
    // Skills: Long fins (swim speed) and Jet fins (dash).
    const dash = readInput(false) ? SWIM.dashMult * (1 + perk('dash')) : 1;
    vel.addScaledVector(wish, SWIM.accel * (1 + perk('swim')) * dash * dt);
    vel.multiplyScalar(Math.exp(-SWIM.drag * dt));
    // A faint buoyant bob so standing still never feels frozen.
    vel.y += Math.sin(t * 0.9) * 0.15 * dt;
    if (stun > 0) vel.y -= SWIM.stunSink * dt; // limp: you sink
    p.addScaledVector(vel, dt);

    const floor = floorY(p.x, p.z) + SWIM.eye;
    if (p.y < floor) { p.y = floor; if (vel.y < 0) vel.y = 0; }
    // Treading water: your head breaks the surface and bobs with the swell.
    const top = SURFACE_Y + SWIM.float + Math.sin(t * 1.3) * 0.07;
    if (p.y > top) { p.y = top; if (vel.y > 0) vel.y = 0; }
    // Swim up against a raft and you haul yourself onto it.
    const deck = deckAt(p.x, p.z);
    if (deck !== null && p.y > SURFACE_Y - SWIM.climb) {
      p.y = deck + WALK.eye;
      vel.set(vel.x * 0.3, 0, vel.z * 0.3);
      onFoot = true; grounded = true;
    }
  }

  function walk(dt, p) {
    const dash = readInput(true) ? WALK.dashMult : 1;
    vel.x += wish.x * WALK.accel * dash * dt;
    vel.z += wish.z * WALK.accel * dash * dt;
    const k = Math.exp(-(grounded ? WALK.drag : 1) * dt);
    vel.x *= k; vel.z *= k;
    if (grounded && stun <= 0 && keys.has('Space')) { vel.y = WALK.jump; grounded = false; }
    vel.y -= WALK.gravity * dt;
    p.addScaledVector(vel, dt);

    const deck = deckAt(p.x, p.z);
    if (deck !== null && p.y - WALK.eye <= deck && p.y - WALK.eye > deck - 0.6) {
      p.y = deck + WALK.eye;
      if (vel.y < 0) vel.y = 0;
      grounded = true;
    } else {
      grounded = false;
      // Walked off the edge: splash back into the water.
      if (p.y < SURFACE_Y + SWIM.float) { onFoot = false; vel.y = THREE.MathUtils.clamp(vel.y, -3, -1.5); }
    }
  }

  return {
    setCursorLook(v) { cursorLook = v; },
    setMouse({ sens = 1, invertY = false } = {}) { mouse.sens = sens; mouse.invertY = invertY; },
    setDeckQuery(fn) { deckAt = fn; },
    clearKeys() { keys.clear(); },
    get speed() { return vel.length(); },
    get onFoot() { return onFoot; },
    /** Stuns for this many seconds: no movement, sluggish look, and you sink. */
    setStun(secs) { stun = Math.max(stun, secs); stunMax = Math.max(stun, 0.01); vel.multiplyScalar(0.3); },
    get stunned() { return stun > 0; },
    get stunLeft() { return stun; },
    update(dt, t) {
      stun = Math.max(0, stun - dt);
      if (cursorLook && cursor.in && document.pointerLockElement !== canvas) {
        const px = (EDGE_TURN * dt) / SWIM.look;
        look(edgePush(cursor.x) * px, edgePush(cursor.y) * px * 0.6);
      }
      const turn = stun > 0 ? 0 : (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0);
      if (turn) look((turn * SWIM.keyTurn * dt) / SWIM.look, 0);
      euler.set(pitch, yaw, 0);
      camera.quaternion.setFromEuler(euler);
      fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
      right.set(1, 0, 0).applyQuaternion(camera.quaternion);

      const p = camera.position;
      if (onFoot) walk(dt, p); else swim(dt, t, p);
      const r = Math.hypot(p.x, p.z);
      if (r > WORLD_RADIUS) { p.x *= WORLD_RADIUS / r; p.z *= WORLD_RADIUS / r; }

      // Gentle roll that follows how fast you're swimming (steadier on deck).
      sway += dt * (1 + vel.length() * 0.4);
      const roll = onFoot ? 0.002 : 0.006 * (0.3 + Math.min(1, vel.length() / 4));
      camera.rotateZ(Math.sin(sway * 1.3) * roll);
      // Stunned: the view twitches and lolls, easing off as you come round.
      if (stun > 0) {
        const s = stun / stunMax;
        camera.rotateZ(Math.sin(t * 2.3) * 0.12 * s + (Math.random() - 0.5) * 0.03 * s);
        camera.rotateX((Math.random() - 0.5) * 0.025 * s);
      }
    },
  };
}
const _flatFwd = new THREE.Vector3(), _flatRight = new THREE.Vector3();
const _steer = new THREE.Vector3(), _eSteer = new THREE.Euler(), _qOld = new THREE.Quaternion(), _qNew = new THREE.Quaternion();
