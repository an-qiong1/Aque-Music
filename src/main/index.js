const { app, BrowserWindow } = require('electron');
const { scanFolder } = require('./library/scanner.js');
const AudioService = require('./audio/service.js');
const window = require('./window.js');
const tray = require('./utils/tray.js');
const shortcuts = require('./utils/shortcuts.js');
const { registerAll } = require('./ipc/register.js');
const { cleanupAllWatchers } = require('./ipc/files.js');
const { isAudioFile } = require('./utils/audio-formats.js');

let smtc = null;
try {
  smtc = require('./smtc/integration.js');
} catch (err) {
  console.warn('[Main] SMTC integration not available:', err.message);
}

const audio = new AudioService();

const deps = {
  getWin: window.getWin,
  audio,
  togglePin: window.togglePin,
  toggleMaximize: window.toggleMaximize,
  setProgressBar: window.setProgressBar,
  scanner: { scanFolder },
};

process.on('unhandledRejection', (reason) => {
  console.error('[Main] Unhandled Rejection:', reason?.stack || reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Main] Uncaught Exception:', err?.stack || err.message);
});

function handleFilePath(filePath) {
  const win = window.getWin();
  if (win && !win.isDestroyed()) {
    win.show();
    win.webContents.send('file:open', filePath);
  }
}

app.setAppUserModelId('com.aque.player');
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const fp = argv.find(a => isAudioFile(a));
    if (fp) handleFilePath(fp);
    else window.getWin()?.show();
  });
}

app.whenReady().then(() => {
  window.create();
  audio.init();
  registerAll(deps);
  audio.start();
  tray.create(deps);
  shortcuts.register(deps);

  const fp = process.argv.find(a => isAudioFile(a));
  if (fp) handleFilePath(fp);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) window.create();
  else window.getWin()?.show();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  shortcuts.unregisterAll();
  cleanupAllWatchers();
  audio.dispose();
  if (smtc && smtc.cleanup) {
    smtc.cleanup();
  }
});
