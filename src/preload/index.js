const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  hideWindow: () => ipcRenderer.invoke('window:hide'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  togglePin: () => ipcRenderer.invoke('window:pin'),

  // File dialogs
  openFiles: () => ipcRenderer.invoke('dialog:openFiles'),
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),

  // File system
  scanFolder: (folderPath) => ipcRenderer.invoke('fs:scanFolder', folderPath),

  // Folder watching
  watchFolder: (path) => ipcRenderer.invoke('fs:watchFolder', path),

   // Audio engine
   audioInit: () => ipcRenderer.invoke('audio:init'),
   audioLoadAndPlay: (filePath) => ipcRenderer.invoke('audio:loadAndPlay', filePath),
   audioLoad: (filePath) => ipcRenderer.invoke('audio:load', filePath),
   audioPlay: () => ipcRenderer.invoke('audio:play'),
  audioPause: () => ipcRenderer.invoke('audio:pause'),
  audioPlayPause: () => ipcRenderer.invoke('audio:playPause'),
  audioStop: () => ipcRenderer.invoke('audio:stop'),
  audioSeek: (sec) => ipcRenderer.invoke('audio:seek', sec),
  audioSetVolume: (vol) => ipcRenderer.invoke('audio:setVolume', vol),
  audioGetVolume: () => ipcRenderer.invoke('audio:getVolume'),
  audioGetState: () => ipcRenderer.invoke('audio:getState'),

  // Tags & Lyrics
  readAllMetadata: (filePath) => ipcRenderer.invoke('tag:readAll', filePath),
  readTags: (filePath) => ipcRenderer.invoke('tag:read', filePath),
  readCover: (filePath) => ipcRenderer.invoke('tag:readCover', filePath),
  readLrc: (audioPath) => ipcRenderer.invoke('lrc:read', audioPath),

  // Library index
  getLibraryIndex: () => ipcRenderer.invoke('library:getIndex'),
  buildLibraryIndex: (folderPaths) => ipcRenderer.invoke('library:buildIndex', folderPaths),
  clearLibraryIndex: () => ipcRenderer.invoke('library:clearIndex'),

  // File existence
  fileExists: (filePath) => ipcRenderer.invoke('fs:fileExists', filePath),

  // Playlist persistence
  playlistSave: (data) => ipcRenderer.invoke('playlist:save', data),
  playlistLoad: () => ipcRenderer.invoke('playlist:load'),

  // Playback stats (only recordPlayback is used by renderer)
  recordPlayback: (filePath) => ipcRenderer.invoke('stats:recordPlayback', filePath),

  // SMTC (System Media Transport Controls) for Wallpaper Engine
  smtcUpdate: (info) => ipcRenderer.invoke('smtc:update', info),


  // Events (main -> renderer)
  onAudioPosition: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('audio:positionUpdate', h);
    return () => ipcRenderer.removeListener('audio:positionUpdate', h);
  },
  onAudioState: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('audio:stateEvent', h);
    return () => ipcRenderer.removeListener('audio:stateEvent', h);
  },
  onAudioFFT: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('audio:fftUpdate', h);
    return () => ipcRenderer.removeListener('audio:fftUpdate', h);
  },
  onShortcut: (cb) => {
    const h = (_e, action) => cb(action);
    const actions = ['shortcut:playPause', 'shortcut:next', 'shortcut:prev'];
    const removers = actions.map(a => {
      ipcRenderer.on(a, h);
      return () => ipcRenderer.removeListener(a, h);
    });
    return () => removers.forEach(r => r());
  },
  onFileOpen: (cb) => {
    const h = (_e, fp) => cb(fp);
    ipcRenderer.on('file:open', h);
    return () => ipcRenderer.removeListener('file:open', h);
  },
  onFolderChange: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('fs:folderChange', h);
    return () => ipcRenderer.removeListener('fs:folderChange', h);
  },
  onLibraryProgress: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('library:progress', h);
    return () => ipcRenderer.removeListener('library:progress', h);
  },
});
