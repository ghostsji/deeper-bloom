// Save slots. In the desktop app they're files in its user data folder (see
// electron/saves.cjs); in a browser they fall back to localStorage. Each slot holds the
// game's own save JSON plus a summary for the menu.
const desktop = typeof window !== 'undefined' ? window.deeperBloom?.saves : null;
export const SLOT_COUNT = 3;
const key = (n) => `deeperbloom-slot-${n}`;

const local = {
  list: () => Array.from({ length: SLOT_COUNT }, (_, i) => {
    try {
      const j = JSON.parse(localStorage.getItem(key(i + 1)));
      return j ? { slot: i + 1, savedAt: j.savedAt, summary: j.summary || {} } : null;
    } catch { return null; }
  }),
  read: (n) => {
    try { return JSON.parse(localStorage.getItem(key(n)))?.data ?? null; } catch { return null; }
  },
  write: (n, data, summary) => {
    try { localStorage.setItem(key(n), JSON.stringify({ savedAt: new Date().toISOString(), summary, data })); return true; } catch { return false; }
  },
};

/** One entry per slot: { slot, savedAt, summary } or null when empty. */
export const listSlots = async () => (desktop ? desktop.list() : local.list());
/** The game's save JSON from a slot, or null. */
export const readSlot = async (n) => (desktop ? desktop.read(n) : local.read(n));
export const writeSlot = async (n, data, summary) => (desktop ? desktop.write(n, data, summary) : local.write(n, data, summary));
