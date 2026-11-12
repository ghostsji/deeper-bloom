// The bridge to the Flutter desktop shell (deeper_bloom_shell). Loaded before everything
// else: it also gives voice.js its "live voice" connection, which in the shell is Flutter
// generating neural voice lines (in the Electron app it's the preload bridge instead).

export const SHELL = new URLSearchParams(location.search).get('shell') === 'flutter' ? window.chrome?.webview ?? null : null;
export const toShell = (msg) => SHELL?.postMessage(JSON.stringify(msg));

const handlers = new Map();
// Handle one kind of message from Flutter.
export function onShell(type, fn) { handlers.set(type, [...(handlers.get(type) || []), fn]); }

// Requests that Flutter answers with a { type: 'reply', id, ok, value | error } message.
let nextId = 1;
const pending = new Map();
export function askShell(type, body = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    toShell({ ...body, type, id });
  });
}

SHELL?.addEventListener('message', (e) => dispatchShell(typeof e.data === 'string' ? JSON.parse(e.data) : e.data));

// Handles one message from Flutter (exported so tests can stand in for the shell).
export function dispatchShell(msg) {
  if (msg.type === 'reply') {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.ok) p?.resolve(msg.value); else p?.reject(new Error(msg.error || 'shell request failed'));
    return;
  }
  for (const fn of handlers.get(msg.type) || []) fn(msg);
}

// Live neural voice through Flutter: it caches each line as an MP3 under https://voice.local/.
if (SHELL && !window.deeperBloom) {
  window.deeperBloom = {
    tts: {
      voices: () => askShell('ttsVoices'),
      synth: async (req) => {
        const url = await askShell('ttsSynth', req);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`voice file ${res.status}`);
        return res.arrayBuffer();
      },
    },
  };
}
