const { globalShortcut } = require('electron');

function register({ getWin, audio }) {
  const sendToWin = (channel, data) => {
    const win = getWin();
    if (win && !win.isDestroyed())
      win.webContents.send(channel, data);
  };

  globalShortcut.register('MediaPlayPause', () => sendToWin('shortcut:playPause', 'playPause'));
  globalShortcut.register('MediaNextTrack', () => sendToWin('shortcut:next', 'next'));
  globalShortcut.register('MediaPreviousTrack', () => sendToWin('shortcut:prev', 'prev'));
  globalShortcut.register('Ctrl+P', () => sendToWin('shortcut:playPause', 'playPause'));
  globalShortcut.register('Ctrl+N', () => sendToWin('shortcut:next', 'next'));
  globalShortcut.register('Ctrl+B', () => sendToWin('shortcut:prev', 'prev'));
}

function unregisterAll() {
  globalShortcut.unregisterAll();
}

module.exports = { register, unregisterAll };
