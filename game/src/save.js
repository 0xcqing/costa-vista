import { SAVE_KEY } from './config.js';

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadSave() {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return {
      money: Number.isFinite(data.money) ? Math.max(0, Math.round(data.money)) : 500,
      completedMissions: Array.isArray(data.completedMissions)
        ? data.completedMissions.filter((id) => typeof id === 'string')
        : [],
      mute: Boolean(data.mute),
      day: Number.isFinite(data.day) ? Math.max(1, Math.round(data.day)) : 1,
      savedAt: Number.isFinite(data.savedAt) ? data.savedAt : 0,
    };
  } catch {
    return null;
  }
}

export function writeSave(state) {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(SAVE_KEY, JSON.stringify({
      money: Math.max(0, Math.round(state.money ?? 0)),
      completedMissions: Array.isArray(state.completedMissions) ? state.completedMissions.slice() : [],
      mute: Boolean(state.mute),
      day: Math.max(1, Math.round(state.day ?? 1)),
      savedAt: Date.now(),
    }));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  const store = storage();
  if (!store) return false;
  try {
    store.removeItem(SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}
