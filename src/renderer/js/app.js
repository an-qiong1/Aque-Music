AQUE.App = {
  _pendingFileToPlay: null,
  _libraryLoaded: false,

  init() {
    if (AQUE.API.isElectron) {
      AQUE.API.audioInit();
      this._setupElectronListeners();
    }

    AQUE.Visualizer.init();
    AQUE.Titlebar.init();
    AQUE.Lyrics.init();
    AQUE.Playlist.init();
    AQUE.Player.init();

    AQUE.Playlist.render();

    this._setupFileDrop();
    this._loadLibrary();
    this._setupKeyboardShortcuts();
  },

  _setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // 忽略输入框内的按键
      const target = e.target;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      // 空格键播放/暂停
      if (e.code === 'Space') {
        e.preventDefault();
        AQUE.Player._onPlay();
      }

      // 左方向键快退5秒
      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        const newPos = Math.max(0, AQUE.State.currentDuration * window.AQUE_Progress - 5);
        AQUE.API.audioSeek(newPos);
      }

      // 右方向键快进5秒
      if (e.code === 'ArrowRight') {
        e.preventDefault();
        const newPos = Math.min(AQUE.State.currentDuration, AQUE.State.currentDuration * window.AQUE_Progress + 5);
        AQUE.API.audioSeek(newPos);
      }

      // Ctrl+P 播放/暂停
      if (e.ctrlKey && e.code === 'KeyP') {
        e.preventDefault();
        AQUE.Player._onPlay();
      }

      // Ctrl+N 下一首
      if (e.ctrlKey && e.code === 'KeyN') {
        e.preventDefault();
        AQUE.Player.next();
      }

      // Ctrl+B 上一首
      if (e.ctrlKey && e.code === 'KeyB') {
        e.preventDefault();
        AQUE.Player.prev();
      }
    });
  },

  _setupElectronListeners() {
    AQUE.API.onAudioPosition((data) => {
      AQUE.Player.updatePosition(data);
    });

    AQUE.API.onAudioState((event) => {
      AQUE.Player.handleStateEvent(event);
    });

    AQUE.API.onAudioFFT((data) => {
      AQUE.Visualizer.updateFFTData(data);
    });

    AQUE.API.onShortcut((action) => {
      if (action === 'playPause') AQUE.Player._onPlay();
      else if (action === 'next') AQUE.Player.next();
      else if (action === 'prev') AQUE.Player.prev();
    });

    AQUE.API.onFileOpen((filePath) => {
      if (!this._libraryLoaded) {
        this._pendingFileToPlay = filePath;
        return;
      }
      this._playFile(filePath);
    });

    AQUE.API.onFolderChange((data) => {
      const lowerFilePath = data.filePath.toLowerCase();
      const found = AQUE.Utils.findTrackAcrossAlbums(data.filePath);
      if (data.event === 'add') {
        if (!found) {
          const name = AQUE.Utils.basename(data.filePath);
          const tracks = AQUE.Playlist.getTracks();
          tracks.push({ name, path: data.filePath, title: AQUE.Utils.stripExtension(name), artist: '', duration: 0 });
          AQUE.Playlist.render();
          AQUE.Playlist._save();
        }
      } else if (data.event === 'remove') {
        // 从所有专辑中删除
        for (let i = 0; i < AQUE.State.albums.length; i++) {
          const album = AQUE.State.albums[i];
          const idx = album.tracks.findIndex(t => t.path.toLowerCase() === lowerFilePath);
          if (idx !== -1) {
            album.tracks.splice(idx, 1);
            if (i === AQUE.State.activeAlbumIndex) {
              if (AQUE.State.currentPlayingIndex === idx) {
                AQUE.API.audioStop();
                AQUE.State.setCurrentPlayingIndex(-1);
              } else if (AQUE.State.currentPlayingIndex > idx) {
                AQUE.State.setCurrentPlayingIndex(AQUE.State.currentPlayingIndex - 1);
              }
            }
            break;
          }
        }
        AQUE.Playlist.render();
        AQUE.Playlist._save();
      }
    });

    AQUE.API.onLibraryProgress((data) => {
      AQUE.Utils.showToast(`索引中 ${data.current}/${data.total}: ${data.currentFile}`, 0);
    });
  },

  _setupFileDrop() {
    document.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    document.addEventListener('drop', (e) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      const audioExts = ['.mp3','.flac','.wav','.ogg','.aac','.m4a','.wma','.opus','.ape','.aif','.aiff','.dsf','.dff','.wv','.mpc','.mid','.midi'];
      const audioFiles = files.filter(f => {
        const ext = f.name.toLowerCase().match(/\.[^.]+$/);
        return ext && audioExts.includes(ext[0]);
      });
      if (audioFiles.length === 0) return;
      const tracks = AQUE.Playlist.getTracks();
      audioFiles.forEach(f => {
        if (!AQUE.Utils.trackExistsInAlbums(f.path)) {
          tracks.push({ name: f.name, path: f.path });
        }
      });
      AQUE.Playlist.render();
      AQUE.Playlist._save();
      if (AQUE.State.currentPlayingIndex < 0) {
        AQUE.Player.playTrack(0);
      }
    });
  },

  _playFile(filePath) {
    const found = AQUE.Utils.findTrackAcrossAlbums(filePath);
    if (found) {
      // 找到已存在的，切换到对应专辑并播放
      if (found.albumIndex !== AQUE.State.activeAlbumIndex) {
        AQUE.State.setActiveAlbumIndex(found.albumIndex);
        AQUE.Playlist.render();
      }
      AQUE.Player.playTrack(found.trackIndex);
      return;
    }
    // 不存在，添加到当前专辑
    const tracks = AQUE.Playlist.getTracks();
    const name = AQUE.Utils.basename(filePath);
    tracks.push({ name, path: filePath });
    AQUE.Playlist.render();
    AQUE.Playlist._save();
    AQUE.Player.playTrack(tracks.length - 1);
  },

  _loadLibrary() {
    if (!AQUE.API.isElectron) return;
    AQUE.API.playlistLoad().then((saved) => {
      if (saved && saved.albums && saved.albums.length > 0) {
        AQUE.State.albums = saved.albums;
        if (typeof saved.activeAlbumIndex === 'number') {
          AQUE.State.activeAlbumIndex = saved.activeAlbumIndex;
        }
        AQUE.State.libraryFolders = Array.isArray(saved.libraryFolders) ? saved.libraryFolders : [];
        if (typeof saved.autoOnlineLyrics === 'boolean') {
          AQUE.State.autoOnlineLyrics = saved.autoOnlineLyrics;
        }
        AQUE.Playlist.render();
        if (!this._pendingFileToPlay && saved.currentPlayingIndex >= 0) {
          AQUE.Player.restoreSelectedTrack(saved.currentPlayingIndex);
        }
        for (const folder of AQUE.State.libraryFolders) {
          AQUE.API.watchFolder(folder);
        }
      } else {
        AQUE.API.getLibraryIndex().then((index) => {
          if (index && index.tracks && index.tracks.length > 0) {
            const currentAlbum = AQUE.State.albums[AQUE.State.activeAlbumIndex];
            const existingTracks = currentAlbum ? currentAlbum.tracks : [];
            const existingPaths = new Set(existingTracks.map(t => t.path));
            const newTracks = index.tracks.filter(t => !existingPaths.has(t.path));
            if (currentAlbum) {
              currentAlbum.tracks = [...existingTracks, ...newTracks];
            } else {
              AQUE.State.albums[AQUE.State.activeAlbumIndex] = { name: '默认专辑', tracks: newTracks };
            }
            AQUE.State.libraryFolders = index.folders || [];
            AQUE.Playlist.render();
            for (const folder of AQUE.State.libraryFolders) {
              AQUE.API.watchFolder(folder);
            }
          }
        }).catch(() => {});
      }
      this._libraryLoaded = true;
      if (this._pendingFileToPlay) {
        const pendingFile = this._pendingFileToPlay;
        this._pendingFileToPlay = null;
        this._playFile(pendingFile);
      }
    }).catch(() => {});
  },
};

window.onload = () => {
  AQUE.App.init();
};
