window.AQUE = window.AQUE || {};

AQUE.State = {
  albums: [{ name: '默认专辑', tracks: [] }],
  activeAlbumIndex: 0,
  currentPlayingIndex: -1,
  currentLyrics: [],
  lastLyricIdx: -1,
  playMode: 0,
  isPinned: false,
  isPlaying: false,
  currentDuration: 0,
  libraryFolders: [],

  setCurrentPlayingIndex(index) {
    this.currentPlayingIndex = index;
  },

  setActiveAlbumIndex(index) {
    this.activeAlbumIndex = index;
  },

  getTracks() {
    return this.albums[this.activeAlbumIndex]?.tracks || [];
  },
};

AQUE.CoverCache = {
  _cache: new Map(),
  _MAX: 500,
  get(path) {
    return this._cache.get(path);
  },
  set(path, data) {
    if (this._cache.size >= this._MAX) {
      const firstKey = this._cache.keys().next().value;
      this._cache.delete(firstKey);
    }
    this._cache.set(path, data);
  },
  delete(path) {
    this._cache.delete(path);
  },
  clear() {
    this._cache.clear();
  }
};

AQUE.API = {
  get isElectron() {
    return typeof window.electronAPI !== 'undefined';
  },

  minimizeWindow() { if (this.isElectron) return window.electronAPI.minimizeWindow(); },
  closeWindow() { if (this.isElectron) return window.electronAPI.closeWindow(); },
  togglePin() { if (this.isElectron) return window.electronAPI.togglePin(); return Promise.resolve(false); },

  openFiles() { if (this.isElectron) return window.electronAPI.openFiles(); return Promise.resolve([]); },
  openFolder() { if (this.isElectron) return window.electronAPI.openFolder(); return Promise.resolve(null); },
  scanFolder(fp) { if (this.isElectron) return window.electronAPI.scanFolder(fp); return Promise.resolve([]); },
  watchFolder(fp) { if (this.isElectron) return window.electronAPI.watchFolder(fp); },

  audioInit() { if (this.isElectron) return window.electronAPI.audioInit(); },
   audioLoadAndPlay(fp) { if (this.isElectron) return window.electronAPI.audioLoadAndPlay(fp); },
   audioLoad(fp) { if (this.isElectron) return window.electronAPI.audioLoad(fp); },
   audioPlay() { if (this.isElectron) return window.electronAPI.audioPlay(); },
  audioPause() { if (this.isElectron) return window.electronAPI.audioPause(); },
  audioPlayPause() { if (this.isElectron) return window.electronAPI.audioPlayPause(); },
  audioStop() { if (this.isElectron) return window.electronAPI.audioStop(); },
  audioSeek(s) { if (this.isElectron) return window.electronAPI.audioSeek(s); },
  audioSetVolume(v) { if (this.isElectron) return window.electronAPI.audioSetVolume(v); },
  audioGetVolume() { if (this.isElectron) return window.electronAPI.audioGetVolume(); return Promise.resolve(0.8); },
  audioGetState() { if (this.isElectron) return window.electronAPI.audioGetState(); return Promise.resolve({ state: 'stopped', position: 0, length: 0 }); },

  readAllMetadata(fp) {
    // Cached in main process disk cache (faster than re-parsing)
    if (this.isElectron) return window.electronAPI.readAllMetadata(fp);
    return Promise.resolve(null);
  },
  readTags(fp) { if (this.isElectron) return window.electronAPI.readTags(fp); return Promise.resolve(null); },
  readCover(fp) {
    if (!this.isElectron) return Promise.resolve(null);
    const cached = AQUE.CoverCache.get(fp);
    if (cached) return Promise.resolve(cached);
    return window.electronAPI.readCover(fp).then(data => {
      if (data) AQUE.CoverCache.set(fp, data);
      return data;
    });
  },
  readLrc(ap) { if (this.isElectron) return window.electronAPI.readLrc(ap); return Promise.resolve(null); },

  getLibraryIndex() { if (this.isElectron) return window.electronAPI.getLibraryIndex(); return Promise.resolve(null); },
  buildLibraryIndex(folderPaths) { if (this.isElectron) return window.electronAPI.buildLibraryIndex(folderPaths); return Promise.resolve(null); },
  clearLibraryIndex() { if (this.isElectron) return window.electronAPI.clearLibraryIndex(); return Promise.resolve(false); },
  fileExists(fp) { if (this.isElectron) return window.electronAPI.fileExists(fp); return Promise.resolve(true); },
  recordPlayback(fp) { if (this.isElectron) return window.electronAPI.recordPlayback(fp); },
  playlistSave(data) { if (this.isElectron) return window.electronAPI.playlistSave(data); },
  playlistLoad() { if (this.isElectron) return window.electronAPI.playlistLoad(); return Promise.resolve(null); },

  smtcUpdate(info) { if (this.isElectron) return window.electronAPI.smtcUpdate(info); return Promise.resolve(false); },

  onAudioPosition(cb) { if (this.isElectron) return window.electronAPI.onAudioPosition(cb); },
  onAudioState(cb) { if (this.isElectron) return window.electronAPI.onAudioState(cb); },
  onAudioFFT(cb) { if (this.isElectron) return window.electronAPI.onAudioFFT(cb); },
  onShortcut(cb) { if (this.isElectron) return window.electronAPI.onShortcut(cb); },
  onFileOpen(cb) { if (this.isElectron) return window.electronAPI.onFileOpen(cb); },
  onFolderChange(cb) { if (this.isElectron) return window.electronAPI.onFolderChange(cb); },
  onLibraryProgress(cb) { if (this.isElectron) return window.electronAPI.onLibraryProgress(cb); },
};
