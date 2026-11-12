// Desktop shell: a borderless fullscreen window with no menu bar, so pointer lock always
// works and browser shortcuts (Ctrl+W, Ctrl+R) can't close or reload the game.
const { app, BrowserWindow, Menu, protocol, net, ipcMain } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createTTS } = require('./tts.cjs');
const { createSaves } = require('./saves.cjs');

const ROOT = path.join(__dirname, '..');

// DEEPER_BLOOM_USER_DATA=<folder> keeps saves and caches there instead (the smoke test uses a
// throwaway folder so it never touches your own save).
if (process.env.DEEPER_BLOOM_USER_DATA) app.setPath('userData', process.env.DEEPER_BLOOM_USER_DATA);

// Test mode (DEEPER_BLOOM_HEADLESS): keep the off-screen window running at full speed.
if (process.env.DEEPER_BLOOM_HEADLESS) {
  for (const sw of ['disable-renderer-backgrounding', 'disable-backgrounding-occluded-windows', 'disable-background-timer-throttling']) app.commandLine.appendSwitch(sw);
}

// Let the main menu's music start without waiting for a click.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// ES modules don't load from file://, so the game is served from app://game/ instead.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function createWindow(saves) {
  // DEEPER_BLOOM_HEADLESS=1 is for automated testing: the window is shown (hidden windows
  // barely run the game loop) but placed far off-screen and kept off the taskbar.
  const headless = !!process.env.DEEPER_BLOOM_HEADLESS;
  const win = new BrowserWindow({
    fullscreen: !headless && saves.prefs().startFullscreen,
    width: 1280,
    height: 720,
    ...(headless ? { x: -32000, y: -32000, skipTaskbar: true, focusable: false } : {}),
    backgroundColor: '#03111A',
    title: 'Deeper Bloom',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: !headless, preload: path.join(__dirname, 'preload.cjs') },
  });
  // DEEPER_BLOOM_DEBUG=1 exposes the game's internals in devtools (same as ?debug in a browser).
  win.loadURL(`app://game/index.html${process.env.DEEPER_BLOOM_DEBUG ? '?debug' : ''}`);
  // F12 opens devtools while developing; F11 toggles fullscreen like a browser.
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12') win.webContents.toggleDevTools();
    if (input.key === 'F11') win.setFullScreen(!win.isFullScreen());
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  protocol.handle('app', (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname);
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  // Echo's live voice: generated in this process (the page can't reach the service itself).
  const tts = createTTS(path.join(app.getPath('userData'), 'voice-cache'));
  ipcMain.handle('tts:voices', () => tts.voices());
  ipcMain.handle('tts:synth', async (_e, req) => {
    const audio = await tts.synth(req);
    return audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength);
  });
  // Save slots, fullscreen and desktop preferences for the game's menus.
  const saves = createSaves(app.getPath('userData'));
  ipcMain.handle('saves:list', () => saves.list());
  ipcMain.handle('saves:read', (_e, n) => saves.read(n));
  ipcMain.handle('saves:write', (_e, n, data, summary) => saves.write(n, data, summary));
  ipcMain.handle('prefs:get', () => saves.prefs());
  ipcMain.handle('prefs:set', (_e, patch) => saves.setPrefs(patch));
  ipcMain.handle('window:fullscreen', (e, on) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (typeof on === 'boolean') win.setFullScreen(on);
    return win.isFullScreen();
  });
  createWindow(saves);
});

app.on('window-all-closed', () => app.quit());

// A voice-service hiccup (it can drop the socket mid-line) must never take the game down.
process.on('uncaughtException', (err) => console.error('[deeper-bloom]', err));
