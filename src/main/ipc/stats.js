const { ipcMain } = require('electron');
const stats = require('../utils/playback-stats.js');
const { trustedHandler, assertFilePath } = require('../utils/ipc-utils.js');

function register() {
  ipcMain.handle('stats:recordPlayback', trustedHandler((event, filePath) => {
    assertFilePath(filePath, 'filePath');
    return stats.recordPlayback(filePath);
  }));
}

module.exports = { register };
