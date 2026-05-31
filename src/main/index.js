const { app, BrowserWindow } = require('electron');
const { scanFolder } = require('./library/scanner.js');
const AudioService = require('./audio/service.js');
const window = require('./window.js');
const tray = require('./utils/tray.js');
const shortcuts = require('./utils/shortcuts.js');
const { registerAll } = require('./ipc/register.js');
const { cleanupAllWatchers } = require('./ipc/files.js');
const { isAudioFile } = require('./utils/audio-formats.js');
const sleepTimer = require('./utils/sleep-timer.js');

const smtc = require('./smtc/integration.js');

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
  const { setSongInfo } = tray.create(deps);
  deps.setSongInfo = setSongInfo;
  shortcuts.register(deps);

  // 初始化 SMTC 并设置媒体控制回调
  if (smtc.isAvailable()) {
    smtc.init({
      onPlay: () => audio.play(),
      onPause: () => audio.pause(),
      onNext: () => {
        const win = window.getWin();
        if (win && !win.isDestroyed()) {
          win.webContents.send('shortcut:next', 'next');
        }
      },
      onPrevious: () => {
        const win = window.getWin();
        if (win && !win.isDestroyed()) {
          win.webContents.send('shortcut:prev', 'prev');
        }
      }
    });
  }

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
  // 确保isQuitting状态一致
  if (!app.isQuitting) {
    app.isQuitting = true;
  }
  shortcuts.unregisterAll();
  cleanupAllWatchers();
  sleepTimer.stopSleepTimer();
  audio.dispose();
  smtc.cleanup();
});
