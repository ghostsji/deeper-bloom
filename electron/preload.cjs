// The only bridge from the game page to the desktop app: neural voice generation.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('deeperBloom', {
  tts: {
    voices: () => ipcRenderer.invoke('tts:voices'),
    // Resolves to an ArrayBuffer of MP3 audio.
    synth: (req) => ipcRenderer.invoke('tts:synth', req),
  },
});
