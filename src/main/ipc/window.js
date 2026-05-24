const { ipcMain, app } = require('electron');

function register({ getWin, togglePin, toggleMaximize }) {
  ipcMain.handle('window:minimize', () => getWin()?.minimize());
  ipcMain.handle('window:hide', () => getWin()?.hide());
  ipcMain.handle('window:close', () => {
    app.isQuitting = true;
    app.quit();
  });
  ipcMain.handle('window:pin', () => togglePin());
  ipcMain.handle('window:toggleMaximize', () => {
    return toggleMaximize();
  });
  ipcMain.handle('window:getMaximized', () => getWin()?.isMaximized() ?? false);
}

module.exports = { register };
