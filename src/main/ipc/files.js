const { ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const { isAudioFile, AUDIO_EXTS_ARRAY } = require('../utils/audio-formats.js');
const { assertTrustedSender, assertFilePath } = require('../utils/ipc-utils.js');

const watchedFolders = new Map();

function register({ getWin, scanner }) {
  ipcMain.handle('dialog:openFiles', async (event) => {
    assertTrustedSender(event);
    const r = await dialog.showOpenDialog(getWin(), {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '音频文件', extensions: AUDIO_EXTS_ARRAY }],
    });
    return r.canceled ? [] : r.filePaths;
  });

  ipcMain.handle('dialog:openFolder', async (event) => {
    assertTrustedSender(event);
    const r = await dialog.showOpenDialog(getWin(), { properties: ['openDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('fs:scanFolder', async (event, folderPath) => {
    assertTrustedSender(event);
    assertFilePath(folderPath, 'folderPath');
    if (!scanner) return [];
    try {
      return scanner.scanFolder(folderPath);
    } catch (err) {
      console.error('扫描文件夹失败:', err);
      return [];
    }
  });

  ipcMain.handle('fs:watchFolder', async (event, folderPath) => {
    assertTrustedSender(event);
    assertFilePath(folderPath, 'folderPath');
    startWatching(folderPath, getWin);
    return true;
  });

  ipcMain.handle('fs:unwatchFolder', (event, folderPath) => {
    assertTrustedSender(event);
    assertFilePath(folderPath, 'folderPath');
    stopWatching(folderPath);
    return true;
  });

  ipcMain.handle('fs:getWatchedFolders', (event) => {
    assertTrustedSender(event);
    return getWatchedFolders();
  });

  ipcMain.handle('fs:fileExists', async (event, filePath) => {
    assertTrustedSender(event);
    assertFilePath(filePath, 'filePath');
    return fs.existsSync(filePath);
  });
}

function startWatching(folderPath, getWin) {
  if (watchedFolders.has(folderPath)) return;

  const sendToWin = (channel, data) => {
    const win = getWin();
    if (win && !win.isDestroyed())
      win.webContents.send(channel, data);
  };

  const watcher = chokidar.watch(folderPath, {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    depth: 5,
    interval: 2000,
  });

  watcher.on('add', (fp) => {
    if (isAudioFile(fp)) {
      sendToWin('fs:folderChange', { event: 'add', filePath: fp });
    }
  });
  watcher.on('unlink', (fp) => {
    if (isAudioFile(fp)) {
      sendToWin('fs:folderChange', { event: 'remove', filePath: fp });
    }
  });
  watcher.on('change', (fp) => {
    if (isAudioFile(fp)) {
      sendToWin('fs:folderChange', { event: 'change', filePath: fp });
    }
  });

  watcher.on('error', (error) => {
    console.error(`[File Watcher] Error watching ${folderPath}:`, error.message);
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      console.warn(`[File Watcher] Permission denied for ${folderPath}, stopping watcher`);
      stopWatching(folderPath);
      sendToWin('fs:folderChange', { 
        event: 'error', 
        filePath: folderPath,
        error: error.message 
      });
    }
  });

  watchedFolders.set(folderPath, { watcher });
}

function stopWatching(folderPath) {
  if (watchedFolders.has(folderPath)) {
    watchedFolders.get(folderPath).watcher.close();
    watchedFolders.delete(folderPath);
  }
}

function getWatchedFolders() {
  return Array.from(watchedFolders.keys());
}

function cleanupAllWatchers() {
  for (const [folderPath] of watchedFolders) {
    stopWatching(folderPath);
  }
}

module.exports = { register, cleanupAllWatchers };
