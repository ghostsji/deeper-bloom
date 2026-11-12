// Save slots and desktop preferences as files in the app's user data folder:
//   saves/slot<N>.json  { savedAt, summary, data }  (data: the game's own save JSON)
//   prefs.json          { startFullscreen }
const fs = require('node:fs');
const path = require('node:path');

const SLOTS = 3;

function createSaves(userData) {
  const dir = path.join(userData, 'saves');
  const prefsFile = path.join(userData, 'prefs.json');
  const slotFile = (n) => path.join(dir, `slot${n}.json`);
  const valid = (n) => Number.isInteger(n) && n >= 1 && n <= SLOTS;
  const readJson = (file) => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
  };

  return {
    // One entry per slot: { slot, savedAt, summary } or null when empty.
    list() {
      return Array.from({ length: SLOTS }, (_, i) => {
        const j = readJson(slotFile(i + 1));
        return j ? { slot: i + 1, savedAt: j.savedAt, summary: j.summary || {} } : null;
      });
    },
    read(n) {
      return valid(n) ? readJson(slotFile(n))?.data ?? null : null;
    },
    write(n, data, summary) {
      if (!valid(n) || typeof data !== 'string') return false;
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(slotFile(n), JSON.stringify({ savedAt: new Date().toISOString(), summary: summary || {}, data }));
      return true;
    },
    prefs() {
      return { startFullscreen: true, ...readJson(prefsFile) };
    },
    setPrefs(patch) {
      const next = { ...this.prefs(), ...patch };
      fs.mkdirSync(userData, { recursive: true });
      fs.writeFileSync(prefsFile, JSON.stringify(next));
      return next;
    },
  };
}

module.exports = { createSaves, SLOTS };
