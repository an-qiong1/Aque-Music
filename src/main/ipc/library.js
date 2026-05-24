const { ipcMain } = require('electron');
const { buildIndex, getIndex, clearIndex } = require('../library/indexer.js');
const { trustedHandler } = require('../utils/ipc-utils.js');

function register({ getWin }) {
  ipcMain.handle('library:buildIndex', trustedHandler(async (event, folderPaths) => {
    if (!Array.isArray(folderPaths) || folderPaths.some(p => typeof p !== 'string' || p.trim() === '')) {
      throw new Error('Invalid folderPaths');
    }
    return await buildIndex(folderPaths, (progress) => {
      const win = getWin();
      if (win && !win.isDestroyed()) {
        win.webContents.send('library:progress', progress);
      }
    });
  }));

  ipcMain.handle('library:getIndex', trustedHandler((event) => {
    return getIndex();
  }));

  ipcMain.handle('library:clearIndex', trustedHandler((event) => {
    return clearIndex();
  }));
}

module.exports = { register };
