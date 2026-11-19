export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER_EXIT = 4;
export const ACTION_STEAL = 8;
export const ACTION_MUTE = 16;
export const ACTION_UP = 32;
export const ACTION_DOWN = 64;

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'KeyM',
  'ShiftLeft', 'ShiftRight', 'Space', 'Escape', 'Enter',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

export function createInput(canvas) {
  const keys = Object.create(null);
  const held = {
    sprint: false,
    shoot: false,
    handbrake: false,
  };
  const mouse = { x: 0, y: 0, down: false };
  let actions = 0;
  let disposed = false;

  function setMouse(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  }

  function onKeyDown(event) {
    if (!GAME_KEYS.has(event.code)) return;
    event.preventDefault();
    if (event.code === 'Space' && event.target && event.target.tagName === 'BUTTON') return;
    if (!event.repeat) {
      if (event.code === 'Enter' || event.code === 'Space') actions |= ACTION_CONFIRM;
      if (event.code === 'Escape') actions |= ACTION_PAUSE;
      if (event.code === 'KeyE') actions |= ACTION_ENTER_EXIT;
      if (event.code === 'KeyF') actions |= ACTION_STEAL;
      if (event.code === 'KeyM') actions |= ACTION_MUTE;
      if (event.code === 'KeyW' || event.code === 'ArrowUp') actions |= ACTION_UP;
      if (event.code === 'KeyS' || event.code === 'ArrowDown') actions |= ACTION_DOWN;
    }
    keys[event.code] = true;
    updateHeld();
  }

  function onKeyUp(event) {
    if (!GAME_KEYS.has(event.code)) return;
    event.preventDefault();
    keys[event.code] = false;
    updateHeld();
  }

  function updateHeld() {
    held.sprint = Boolean(keys.ShiftLeft || keys.ShiftRight);
    held.handbrake = Boolean(keys.Space);
  }

  function onMouseMove(event) {
    setMouse(event);
  }

  function onMouseDown(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    setMouse(event);
    mouse.down = true;
    held.shoot = true;
    actions |= ACTION_CONFIRM;
  }

  function onMouseUp(event) {
    if (event.button !== 0) return;
    mouse.down = false;
    held.shoot = false;
  }

  function onContextMenu(event) {
    event.preventDefault();
  }

  function onBlur() {
    for (const key of Object.keys(keys)) keys[key] = false;
    mouse.down = false;
    held.shoot = false;
    held.sprint = false;
    held.handbrake = false;
  }

  window.addEventListener('keydown', onKeyDown, { passive: false });
  window.addEventListener('keyup', onKeyUp, { passive: false });
  window.addEventListener('blur', onBlur);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('contextmenu', onContextMenu);

  return {
    mouse,
    held,
    moveAxis() {
      const x = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
      const y = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
      return { x, y };
    },
    isSprinting() {
      return held.sprint;
    },
    isShooting() {
      return held.shoot;
    },
    isHandbrake() {
      return held.handbrake;
    },
    takeActions() {
      const value = actions;
      actions = 0;
      return value;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('contextmenu', onContextMenu);
    },
  };
}
