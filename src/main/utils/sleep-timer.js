const { ipcMain } = require('electron');

let sleepTimer = null;
let sleepTimerStart = null;
let sleepTimerDuration = null;

function startSleepTimer(minutes, callback) {
  stopSleepTimer();

  const ms = minutes * 60 * 1000;
  sleepTimerStart = Date.now();
  sleepTimerDuration = ms;

  sleepTimer = setTimeout(() => {
    if (callback) callback();
    sleepTimer = null;
    sleepTimerStart = null;
    sleepTimerDuration = null;
  }, ms);

  return true;
}

function stopSleepTimer() {
  if (sleepTimer) {
    clearTimeout(sleepTimer);
    sleepTimer = null;
    sleepTimerStart = null;
    sleepTimerDuration = null;
    return true;
  }
  return false;
}

function getRemainingTime() {
  if (!sleepTimer || !sleepTimerStart || !sleepTimerDuration) {
    return 0;
  }
  
  const elapsed = Date.now() - sleepTimerStart;
  const remaining = sleepTimerDuration - elapsed;
  
  return Math.max(0, Math.ceil(remaining / 1000)); // 返回秒数
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

  ipcMain.handle('sleepTimer:getRemainingTime', () => {
    return getRemainingTime();
  });
}

module.exports = { register, stopSleepTimer };
