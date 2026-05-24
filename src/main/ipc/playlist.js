const { ipcMain, app } = require('electron');
const fs = require('fs');
const path = require('path');
const { trustedHandler } = require('../utils/ipc-utils.js');

const PLAYLIST_FILE = 'aque-playlist.json';

function getPath() {
  return path.join(app.getPath('userData'), PLAYLIST_FILE);
}

function register() {
  ipcMain.handle('playlist:save', trustedHandler((event, data) => {
    try {
      fs.writeFileSync(getPath(), JSON.stringify(data), 'utf-8');
      return true;
    } catch (err) {
      console.error('[Playlist] Save failed:', err.message);
      return false;
    }
  }));

  ipcMain.handle('playlist:load', trustedHandler((event) => {
    try {
      const p = getPath();
      if (!fs.existsSync(p)) return null;
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch (err) {
      console.error('[Playlist] Load failed:', err.message);
      return null;
    }
  }));
}

module.exports = { register };
