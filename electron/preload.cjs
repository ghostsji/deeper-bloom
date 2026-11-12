// The only bridge from the game page to the desktop app: neural voice generation, save
// slots as files, fullscreen and desktop preferences.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('deeperBloom', {
  tts: {
    voices: () => ipcRenderer.invoke('tts:voices'),
    // Resolves to an ArrayBuffer of MP3 audio.
    synth: (req) => ipcRenderer.invoke('tts:synth', req),
  },
  saves: {
    list: () => ipcRenderer.invoke('saves:list'),
    read: (slot) => ipcRenderer.invoke('saves:read', slot),
    write: (slot, data, summary) => ipcRenderer.invoke('saves:write', slot, data, summary),
  },
  prefs: {
    get: () => ipcRenderer.invoke('prefs:get'),
    set: (patch) => ipcRenderer.invoke('prefs:set', patch),
  },
  // Pass true/false to change fullscreen; resolves to whether the window is fullscreen.
  fullscreen: (on) => ipcRenderer.invoke('window:fullscreen', on),
});
