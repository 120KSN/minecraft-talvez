const SAVE_KEY = 'blocos-sandbox-save-v1';
const SETTINGS_KEY = 'blocos-sandbox-settings-v1';

export function newGameState(seed = Math.floor(Math.random() * 0xffffffff)) {
  return {
    seed: seed >>> 0,
    edits: {},
    position: null,
    inventory: [
      { id: 1, count: 32 }, { id: 2, count: 32 }, { id: 3, count: 24 },
      { id: 4, count: 24 }, { id: 5, count: 16 }, { id: 6, count: 16 },
      ...Array.from({ length: 30 }, () => null)
    ],
    selected: 0,
    health: 20,
    hunger: 20,
    time: 0.22
  };
}

export function readSave() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  const data = JSON.parse(raw);
  if (!data || !Number.isInteger(data.seed) || !Array.isArray(data.inventory) || !data.edits) {
    throw new Error('O arquivo salvo está incompleto ou inválido.');
  }
  data.inventory = Array.from({ length: 36 }, (_, i) => {
    const item = data.inventory[i];
    return item && Number.isInteger(item.id) && Number.isInteger(item.count) && item.count > 0
      ? { id: item.id, count: Math.min(item.count, 64) }
      : null;
  });
  data.selected = Math.max(0, Math.min(8, Number(data.selected) || 0));
  const health = Number(data.health), hunger = Number(data.hunger);
  data.health = Math.max(0, Math.min(20, Number.isFinite(health) ? health : 20));
  data.hunger = Math.max(0, Math.min(20, Number.isFinite(hunger) ? hunger : 20));
  data.time = Number.isFinite(data.time) ? data.time : 0.22;
  return data;
}

export function writeSave(state) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

export function readSettings() {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return { renderDistance: 2, sensitivity: 1, volume: 0.04 };
  const stored = JSON.parse(raw);
  return {
    renderDistance: Math.max(1, Math.min(4, Number(stored.renderDistance) || 2)),
    sensitivity: Math.max(0.5, Math.min(2, Number(stored.sensitivity) || 1)),
    volume: Math.max(0, Math.min(0.3, Number(stored.volume) || 0))
  };
}

export function writeSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
