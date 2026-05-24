const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');

let _manualProgressTimeout = null;
let _smtcUpdatePending = false;
let _lastSmtcInfo = null;

const VOLUME_FILE = 'aque-volume.json';

let smtc = null;
try {
  smtc = require('../smtc/integration.js');
} catch (err) {
  console.warn('[SMTC] Failed to load integration:', err.message);
}

function getVolumePath() {
  return path.join(app.getPath('userData'), VOLUME_FILE);
}

function loadSavedVolume() {
  try {
    const p = getVolumePath();
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8')).volume ?? 0.8;
    }
  } catch {}
  return 0.8;
}

function saveVolume(vol) {
  try {
    fs.writeFileSync(getVolumePath(), JSON.stringify({ volume: vol }));
  } catch {}
}

function register({ audio, getWin, setProgressBar }) {
  ipcMain.handle('audio:init', () => {
    const ok = audio.init();
    if (ok) audio.setVolume(loadSavedVolume());
    return ok;
  });
  ipcMain.handle('audio:load', (_e, fp) => audio.load(fp));
  ipcMain.handle('audio:loadAndPlay', (_e, fp) => audio.loadAndPlay(fp));
  ipcMain.handle('audio:play', () => audio.play());
  ipcMain.handle('audio:pause', () => audio.pause());
  ipcMain.handle('audio:playPause', () => audio.playPause());
  ipcMain.handle('audio:stop', () => audio.stop());
  ipcMain.handle('audio:seek', (_e, s) => audio.seek(s));
  ipcMain.handle('audio:setVolume', (_e, v) => {
    audio.setVolume(v);
    saveVolume(v);
  });
  ipcMain.handle('audio:getVolume', () => audio.getVolume());
  ipcMain.handle('audio:getState', () => audio.getState());
  ipcMain.handle('audio:isLoaded', () => audio.isLoaded());
  ipcMain.handle('smtc:setTaskbarProgress', (_e, progress, state) => {
    setProgressBar(progress, state);
    if (_manualProgressTimeout) clearTimeout(_manualProgressTimeout);
    _manualProgressTimeout = setTimeout(() => {
      _manualProgressTimeout = null;
    }, 5000);
  });

  ipcMain.handle('smtc:update', async (_e, info) => {
    if (!smtc) return false;
    try {
      _lastSmtcInfo = info;
      const result = await smtc.updateMediaInfo({
        title: info.title || 'Unknown',
        artist: info.artist || 'Unknown Artist',
        album: info.album || '',
        coverBase64: info.cover || null
      });
      if (result && info.state) {
        await smtc.updatePlaybackState({
          state: info.state,
          position: info.position || 0,
          duration: info.duration || 0
        });
      }
      return result;
    } catch (err) {
      console.error('[SMTC] Update error:', err.message);
      return false;
    }
  });

  audio.onPosition((data) => {
    const win = getWin();
    if (win && !win.isDestroyed()) {
      win.webContents.send('audio:positionUpdate', data);
      if (data.length > 0 && !_manualProgressTimeout) {
        setProgressBar(data.position / data.length, data.state);
      }
    }
    if (smtc && data.state && _lastSmtcInfo) {
      if (!_smtcUpdatePending) {
        _smtcUpdatePending = true;
        smtc.updatePlaybackState({
          state: data.state,
          position: data.position,
          duration: data.length
        }).catch(() => {}).finally(() => {
          _smtcUpdatePending = false;
        });
      }
    }
  });

  audio.onState((event) => {
    const win = getWin();
    if (win && !win.isDestroyed())
      win.webContents.send('audio:stateEvent', event);
  });

  audio.onFFT((data) => {
    const win = getWin();
    if (win && !win.isDestroyed())
      win.webContents.send('audio:fftUpdate', data);
  });
}

module.exports = { register };
