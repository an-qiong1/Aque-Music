const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');
const fs = require('fs');

function create({ getWin, audio }) {
  // 托盘图标：优先使用专用托盘图标，fallback 到 app-icon
  const baseDir = path.join(__dirname, '..', '..', '..');
  const iconCandidates = [
    path.join(baseDir, 'assets', 'icons', 'tray-icon-16.png'),
    path.join(baseDir, 'assets', 'icons', 'tray-icon-32.png'),
    path.join(baseDir, 'assets', 'icons', 'app-icon.ico'),
    path.join(baseDir, 'assets', 'icons', 'app-icon-16.png'),
  ];
  
  let trayIcon;
  for (const iconPath of iconCandidates) {
    if (fs.existsSync(iconPath)) {
      trayIcon = nativeImage.createFromPath(iconPath);
      if (!trayIcon.isEmpty()) break;
    }
  }
  
  if (!trayIcon || trayIcon.isEmpty()) {
    console.warn('[Tray] No valid icon found, using default');
    trayIcon = nativeImage.createEmpty();
  }
  
  // Windows 系统托盘标准尺寸为 16x16
  if (process.platform === 'win32' && !trayIcon.isEmpty()) {
    trayIcon = trayIcon.resize({ width: 16, height: 16, quality: 'best' });
  }
  
  const tray = new Tray(trayIcon);
  tray.setToolTip('AQUE Player');
  
  let _currentSongInfo = '';
  let _isPlaying = false;
  let _lastMenuState = '';

  // 更新托盘菜单和工具提示
  function updateTrayMenu(force) {
    const stateKey = `${_isPlaying}|${_currentSongInfo}`;
    if (!force && stateKey === _lastMenuState) return;
    _lastMenuState = stateKey;
    const playLabel = _isPlaying ? '暂停' : '播放';
    const tooltip = _currentSongInfo ? `AQUE Player - ${_currentSongInfo}` : 'AQUE Player';
    
    tray.setToolTip(tooltip);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '显示窗口', click: () => getWin()?.show() },
      { type: 'separator' },
      { label: playLabel, click: () => getWin()?.webContents.send('shortcut:playPause', 'playPause') },
      { label: '下一首', click: () => getWin()?.webContents.send('shortcut:next', 'next') },
      { label: '上一首', click: () => getWin()?.webContents.send('shortcut:prev', 'prev') },
      { type: 'separator' },
      {
        label: '退出', click: () => {
          // 统一退出逻辑
          app.isQuitting = true;
          audio.dispose();
          app.quit();
        }
      },
    ]));
  }
  
  // 监听音频状态变化
  audio.onState((state) => {
    _isPlaying = state === 'playing';
    updateTrayMenu();
  });
  
  // 不监听 position（避免 100ms 重建菜单，状态已由 onState 处理）

  // 更新当前歌曲信息
  function setSongInfo(title, artist) {
    _currentSongInfo = (title && artist) ? `${title} - ${artist}` : (title || '');
    updateTrayMenu(true);
  }
  
  tray.on('double-click', () => getWin()?.show());
  tray.on('click', () => getWin()?.show());
  return { tray, setSongInfo };
}

module.exports = { create };
