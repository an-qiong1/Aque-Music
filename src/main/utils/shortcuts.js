const { globalShortcut } = require('electron');

function register({ getWin, audio }) {
  const sendToWin = (channel, data) => {
    const win = getWin();
    if (win && !win.isDestroyed())
      win.webContents.send(channel, data);
  };

  // 媒体键：直接控制音频服务（不发 IPC 到渲染层，避免双重触发）
  globalShortcut.register('MediaPlayPause', () => {
    audio.playPause();
  });
  globalShortcut.register('MediaNextTrack', () => {
    sendToWin('shortcut:next', 'next');
  });
  globalShortcut.register('MediaPreviousTrack', () => {
    sendToWin('shortcut:prev', 'prev');
  });
  
  // Ctrl+P/N/B 仍然只转发到渲染进程（保持原有行为）
  globalShortcut.register('Ctrl+P', () => sendToWin('shortcut:playPause', 'playPause'));
  globalShortcut.register('Ctrl+N', () => sendToWin('shortcut:next', 'next'));
  globalShortcut.register('Ctrl+B', () => sendToWin('shortcut:prev', 'prev'));
}

function unregisterAll() {
  globalShortcut.unregisterAll();
}

module.exports = { register, unregisterAll };
