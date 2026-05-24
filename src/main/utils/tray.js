const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');

function create({ getWin, audio }) {
  // Windows 托盘使用 ICO 格式以获得最佳兼容性
  const iconPath = path.join(__dirname, '../../assets/icons/app-icon.ico');
  let trayIcon = nativeImage.createFromPath(iconPath);
  // Windows 系统托盘标准尺寸为 16x16
  if (process.platform === 'win32') {
    trayIcon = trayIcon.resize({ width: 16, height: 16, quality: 'best' });
  }
  const tray = new Tray(trayIcon);
  tray.setToolTip('AQUE Player');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示窗口', click: () => getWin()?.show() },
    { type: 'separator' },
    { label: '播放/暂停', click: () => getWin()?.webContents.send('shortcut:playPause', 'playPause') },
    { label: '下一首', click: () => getWin()?.webContents.send('shortcut:next', 'next') },
    { label: '上一首', click: () => getWin()?.webContents.send('shortcut:prev', 'prev') },
    { type: 'separator' },
    {
      label: '退出', click: () => {
        app.isQuitting = true;
        audio.dispose();
        app.quit();
      }
    },
  ]));
  tray.on('double-click', () => getWin()?.show());
  tray.on('click', () => getWin()?.show());
  return tray;
}

module.exports = { create };
