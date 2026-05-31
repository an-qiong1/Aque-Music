const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');

let _manualProgressTimeout = null;
let _lastSmtcInfo = null;

const VOLUME_FILE = 'aque-volume.json';

const smtc = require('../smtc/integration.js');

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

function register({ audio, getWin, setProgressBar, setSongInfo }) {
  ipcMain.handle('audio:init', () => {
    try {
      const ok = audio.init();
      if (ok) audio.setVolume(loadSavedVolume());
      return ok;
    } catch (err) {
      console.error('[Audio] init error:', err.message);
      return false;
    }
  });
  ipcMain.handle('audio:load', (_e, fp) => {
    try { return audio.load(fp); } catch (err) { console.error('[Audio] load error:', err.message); return false; }
  });
  ipcMain.handle('audio:loadAndPlay', (_e, fp) => {
    try { return audio.loadAndPlay(fp); } catch (err) { console.error('[Audio] loadAndPlay error:', err.message); return false; }
  });
  ipcMain.handle('audio:play', () => {
    try { return audio.play(); } catch (err) { console.error('[Audio] play error:', err.message); return false; }
  });
  ipcMain.handle('audio:pause', () => {
    try { return audio.pause(); } catch (err) { console.error('[Audio] pause error:', err.message); return false; }
  });
  ipcMain.handle('audio:playPause', () => {
    try { return audio.playPause(); } catch (err) { console.error('[Audio] playPause error:', err.message); return false; }
  });
  ipcMain.handle('audio:stop', () => {
    try { return audio.stop(); } catch (err) { console.error('[Audio] stop error:', err.message); return false; }
  });
  ipcMain.handle('audio:seek', (_e, s) => {
    try { return audio.seek(s); } catch (err) { console.error('[Audio] seek error:', err.message); return false; }
  });
  ipcMain.handle('audio:setVolume', (_e, v) => {
    try {
      const vol = Math.max(0, Math.min(1, Number(v) || 0));
      audio.setVolume(vol);
      saveVolume(vol);
      return true;
    } catch (err) { console.error('[Audio] setVolume error:', err.message); return false; }
  });
  ipcMain.handle('audio:getVolume', () => {
    try { return audio.getVolume(); } catch (err) { console.error('[Audio] getVolume error:', err.message); return 0.8; }
  });
  ipcMain.handle('audio:getState', () => {
    try { return audio.getState(); } catch (err) { console.error('[Audio] getState error:', err.message); return { state: 'stopped', position: 0, length: 0 }; }
  });
  ipcMain.handle('audio:isLoaded', () => {
    try { return audio.isLoaded(); } catch (err) { console.error('[Audio] isLoaded error:', err.message); return false; }
  });
  ipcMain.handle('smtc:setTaskbarProgress', (_e, progress, state) => {
    setProgressBar(progress, state);
    if (_manualProgressTimeout) clearTimeout(_manualProgressTimeout);
    _manualProgressTimeout = setTimeout(() => {
      _manualProgressTimeout = null;
    }, 5000);
  });

  ipcMain.handle('smtc:update', async (_e, info) => {
    // 更新托盘歌曲信息
    if (setSongInfo) {
      setSongInfo(info.title, info.artist);
    }
    if (!smtc.isAvailable()) return false;
    try {
      _lastSmtcInfo = info;
      const result = await smtc.updateMediaInfo({
        title: info.title || 'Unknown',
        artist: info.artist || 'Unknown Artist',
        album: info.album || '',
        coverBase64: info.cover || null
      });
      if (result && info.state) {
        smtc.updatePlaybackState({
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
    // 定期更新 SMTC 播放状态（同步调用，无性能问题）
    if (smtc.isAvailable() && data.state && _lastSmtcInfo) {
      smtc.updatePlaybackState({
        state: data.state,
        position: data.position,
        duration: data.length
      });
    }
  });

  audio.onState((event) => {
    // 停止时清除 SMTC 缓存
    if (event === 'completed' || event === 'stopped') {
      _lastSmtcInfo = null;
    }
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
