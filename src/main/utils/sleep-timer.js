const { ipcMain } = require('electron');

let sleepTimer = null;

function startSleepTimer(minutes, callback) {
  stopSleepTimer();

  const ms = minutes * 60 * 1000;

  sleepTimer = setTimeout(() => {
    if (callback) callback();
    sleepTimer = null;
  }, ms);

  return true;
}

function stopSleepTimer() {
  if (sleepTimer) {
    clearTimeout(sleepTimer);
    sleepTimer = null;
    return true;
  }
  return false;
}

function register({ audio, getWin }) {
  ipcMain.handle('sleepTimer:start', (_e, minutes) => {
    const result = startSleepTimer(minutes, () => {
      audio.pause();
      const win = getWin();
      if (win && !win.isDestroyed()) {
        win.webContents.send('sleepTimer:expired');
      }
    });
    return result;
  });

  ipcMain.handle('sleepTimer:stop', () => {
    return stopSleepTimer();
  });

  ipcMain.handle('sleepTimer:getStatus', () => {
    return sleepTimer ? 'active' : 'inactive';
  });
}

module.exports = { register };
