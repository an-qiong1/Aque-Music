AQUE.Player = {
  _songTitle: null,
  _songArtist: null,
  _playIcon: null,
  _modeIcon: null,
  _durationTimer: null,
  _shuffleQueue: null,
  _playedHistory: [],
  _loadCounter: 0,
  _statsTrackPath: null,
  _statsRecorded: false,
  _playedDuration: 0,
  _lastPositionUpdate: 0,
  _albumCover: null,
  _coverPlaceholder: null,
  _trackMetaCache: new Map(),  // key: filePath, value: { tags, cover, timestamp }
  _TRACK_CACHE_MAX: 50,
  _modes: [
    { icon: 'ph ph-repeat', toast: '列表循环' },
    { icon: 'ph ph-repeat-once', toast: '单曲循环' },
    { icon: 'ph ph-shuffle', toast: '随机播放' },
  ],

  init() {
    this._songTitle = document.getElementById('song-title');
    this._songArtist = document.getElementById('song-artist');
    this._playIcon = document.getElementById('play-icon');
    this._modeIcon = document.getElementById('mode-icon');
    this._durationTimer = document.getElementById('duration-timer');
    this._albumCover = document.getElementById('album-cover');
    this._coverPlaceholder = document.getElementById('cover-placeholder');

    document.getElementById('play-btn').onclick = () => this._onPlay();
    document.getElementById('prev-btn').onclick = () => this.prev();
    document.getElementById('next-btn').onclick = () => this.next();
    document.getElementById('mode-btn').onclick = () => this._cycleMode();
  },

  setTrackInfo(title, artist) {
    this._songTitle.innerText = title || '未知歌曲';
    this._songArtist.innerText = artist || '未知艺术家';
  },

  _onPlay() {
    const tracks = AQUE.Playlist.getTracks();
    if (AQUE.API.isElectron) {
      if (tracks.length === 0) return;
      if (AQUE.State.currentPlayingIndex < 0) { this.playTrack(0); return; }
      AQUE.API.audioPlayPause();
    } else if (tracks.length > 0) {
      this.playTrack(0);
    }
  },

  _cycleMode() {
    AQUE.State.playMode = (AQUE.State.playMode + 1) % 3;
    this._modeIcon.className = this._modes[AQUE.State.playMode].icon + ' text-2xl';
    AQUE.Utils.showToast(this._modes[AQUE.State.playMode].toast, 1200);
    if (AQUE.State.playMode !== 2) {
      this.resetShuffleQueue();
    }
  },

  prev() {
    const tracks = AQUE.Playlist.getTracks();
    if (tracks.length === 0) return;
    let index = AQUE.State.currentPlayingIndex - 1;
    if (index < 0) index = tracks.length - 1;
    this.playTrack(index);
  },

  next() {
    const tracks = AQUE.Playlist.getTracks();
    if (tracks.length === 0) return;
    let index;
    if (AQUE.State.playMode === 2) {
      // 使用 Fisher-Yates 洗牌算法优化随机播放
      if (!this._shuffleQueue || this._shuffleQueue.length === 0) {
        // 生成新的洗牌队列
        this._shuffleQueue = Array.from({ length: tracks.length }, (_, i) => i);
        for (let i = this._shuffleQueue.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [this._shuffleQueue[i], this._shuffleQueue[j]] = [this._shuffleQueue[j], this._shuffleQueue[i]];
        }
        // 确保第一首不是当前播放的
        if (this._shuffleQueue[0] === AQUE.State.currentPlayingIndex && this._shuffleQueue.length > 1) {
          const swapIdx = Math.floor(Math.random() * (this._shuffleQueue.length - 1)) + 1;
          [this._shuffleQueue[0], this._shuffleQueue[swapIdx]] = [this._shuffleQueue[swapIdx], this._shuffleQueue[0]];
        }
      }
      // 从队列头部取出下一首
      index = this._shuffleQueue.shift();
      // 记录播放历史
      this._playedHistory.push(index);
      if (this._playedHistory.length > 100) {
        this._playedHistory.shift();
      }
    } else {
      index = AQUE.State.currentPlayingIndex + 1;
      if (index >= tracks.length) index = 0;
    }
    this.playTrack(index);
  },

    async restoreSelectedTrack(index) {
      const tracks = AQUE.Playlist.getTracks();
      if (index < 0 || index >= tracks.length) return;
      AQUE.State.setCurrentPlayingIndex(index);
      const file = tracks[index];
      this.setTrackInfo(file.title || AQUE.Utils.stripExtension(file.name), file.artist || '未知艺术家');
    AQUE.State.currentLyrics = [];
    AQUE.State.lastLyricIdx = -1;
    AQUE.Lyrics.render();
    AQUE.Playlist.render();

    // 重置进度条
    window.AQUE_Progress = 0;
    AQUE.Visualizer._lastProgress = -1;
    this._durationTimer.innerText = '0:00';

    if (AQUE.API.isElectron && file.path) {
        // 读取完整元数据（标签、嵌入歌词、外挂LRC、封面）
        await this._readTrackMetadata(file);
        // 加载音频到引擎（不播放），使进度条和播放按钮可用
        await AQUE.API.audioLoad(file.path);
        this._statsTrackPath = file.path;
        this._statsRecorded = false;
        this._playedDuration = 0;
        this._lastPositionUpdate = Date.now();
        // 获取初始状态并更新UI（显示曲目总时长）
        this._durationTimer.innerText = '0:00';
        const initState = await AQUE.API.audioGetState();
        if (initState) {
          this.updatePosition(initState);
        }
        if (!AQUE.State.currentLyrics || AQUE.State.currentLyrics.length === 0) {
          AQUE.Lyrics.render();
        }
      }
    },

  async playTrack(index) {
    const tracks = AQUE.Playlist.getTracks();
    if (index < 0 || index >= tracks.length) return;
    this._loadCounter++;
    AQUE.State.setCurrentPlayingIndex(index);
    AQUE.State.currentLyrics = [];
    AQUE.State.lastLyricIdx = -1;
    AQUE.Lyrics.render();

    // 切换曲目时立即重置进度条
    window.AQUE_Progress = 0;
    AQUE.Visualizer._lastProgress = -1;

    const file = tracks[index];

    if (AQUE.API.isElectron) {
      if (file.path) {
        const exists = await AQUE.API.fileExists(file.path);
        if (!exists) {
          file.missing = true;
          AQUE.Utils.showToast('文件不存在：' + (file.title || file.name), 2000);
          AQUE.Playlist.render();
          this._saveDebounced();
          return;
        }
        file.missing = false;
      }
        await this._readTrackMetadata(file);
        this._durationTimer.innerText = '0:00';
        AQUE.API.audioLoadAndPlay(file.path);
        this._statsTrackPath = file.path;
        this._statsRecorded = false;
        this._playedDuration = 0;
        this._lastPositionUpdate = Date.now();
    }

    this._setupMediaSession(file);
    AQUE.Playlist.render();
    this._saveDebounced();
  },

  getUpNextTracks(count = 5) {
    const tracks = AQUE.Playlist.getTracks();
    if (tracks.length === 0) return [];
    
    if (AQUE.State.playMode === 2 && this._shuffleQueue) {
      return this._shuffleQueue.slice(0, count).map(i => tracks[i]);
    }
    
    const result = [];
    for (let i = 1; i <= count && result.length < count; i++) {
      const idx = (AQUE.State.currentPlayingIndex + i) % tracks.length;
      result.push(tracks[idx]);
    }
    return result;
  },

  getPlayedHistory(count = 10) {
    const tracks = AQUE.Playlist.getTracks();
    return this._playedHistory.slice(-count).reverse().map(i => tracks[i]);
  },

  clearHistory() {
    this._playedHistory = [];
  },

  resetShuffleQueue() {
    this._shuffleQueue = null;
    this._playedHistory = [];
  },

  _saveDebounced() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => AQUE.Playlist._save(), 1000);
  },

  async _readTrackMetadata(file) {
    const loadToken = this._loadCounter;
    let title = '';
    let artist = '未知艺术家';
    let lrcText = '';

    const fileNameWithoutExt = AQUE.Utils.stripExtension(file.name);
    const parsed = AQUE.TrackNameParser.parse(fileNameWithoutExt);
    if (parsed.title) title = parsed.title;
    if (parsed.artist) artist = parsed.artist;

    // Check cache first
    const filePath = file.path;
    if (AQUE.API.isElectron && filePath) {
      const cached = this._trackMetaCache.get(filePath);
      if (cached && cached.tags) {
        const tags = cached.tags;
        if (tags.duration > 0) AQUE.State.currentDuration = tags.duration;
        if (tags.title) title = tags.title;
        if (tags.artist) artist = tags.artist;
        if (tags.lyrics) {
          lrcText = tags.lyrics;
          AQUE.State.currentLyrics = AQUE.Utils.parseLRC(lrcText);
        }
        const formatEl = document.getElementById('track-format');
        const qualityEl = document.getElementById('track-quality');
        if (formatEl) formatEl.textContent = (file.name.split('.').pop() || 'LOCAL').toUpperCase();
        if (qualityEl) {
          const sampleRate = tags.sampleRate ? Math.round(tags.sampleRate / 1000) + ' kHz' : '';
          const bitrate = tags.bitrate ? Math.round(tags.bitrate / 1000) + ' kbps' : '';
          qualityEl.textContent = [sampleRate, bitrate].filter(Boolean).join(' · ') || '本地音频';
        }

        if (cached.cover) this._setAlbumCover(cached.cover);
        else this._setAlbumCover(null);

        if (AQUE.State.currentLyrics.length === 0) {
          const extLrc = await AQUE.API.readLrc(filePath);
          if (loadToken !== this._loadCounter) return;
          if (extLrc) {
            lrcText = extLrc;
            AQUE.State.currentLyrics = AQUE.Utils.parseLRC(lrcText);
          }
        }

        if (loadToken !== this._loadCounter) return;
        this.setTrackInfo(title, artist);

        if (navigator.mediaSession) {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: title || AQUE.Utils.stripExtension(file.name),
            artist: artist || '未知艺术家',
            album: file.album || '',
            artwork: [],
          });
        }

        const tracks = AQUE.Playlist.getTracks();
        if (AQUE.State.currentPlayingIndex >= 0 && AQUE.State.currentPlayingIndex < tracks.length) {
          tracks[AQUE.State.currentPlayingIndex].title = title;
          tracks[AQUE.State.currentPlayingIndex].artist = artist;
        }

        AQUE.Lyrics.render();

        if (AQUE.State.autoOnlineLyrics && AQUE.State.currentLyrics.length === 0 && AQUE.API.isElectron && filePath) {
          AQUE.Lyrics.searchOnline(artist || '', title || AQUE.Utils.stripExtension(file.name), loadToken);
        }
        return;
      }
    }

    if (AQUE.API.isElectron && filePath) {
      const tags = await AQUE.API.readTags(file.path);
      if (loadToken !== this._loadCounter) return;
      if (tags) {
        if (tags.duration > 0) AQUE.State.currentDuration = tags.duration;
        if (tags.title) title = tags.title;
        if (tags.artist) artist = tags.artist;
        if (tags.lyrics) {
          lrcText = tags.lyrics;
          AQUE.State.currentLyrics = AQUE.Utils.parseLRC(lrcText);
        }
        const formatEl = document.getElementById('track-format');
        const qualityEl = document.getElementById('track-quality');
        if (formatEl) formatEl.textContent = (file.name.split('.').pop() || 'LOCAL').toUpperCase();
        if (qualityEl) {
          const sampleRate = tags.sampleRate ? Math.round(tags.sampleRate / 1000) + ' kHz' : '';
          const bitrate = tags.bitrate ? Math.round(tags.bitrate / 1000) + ' kbps' : '';
          qualityEl.textContent = [sampleRate, bitrate].filter(Boolean).join(' · ') || '本地音频';
        }
      }

      const cover = await AQUE.API.readCover(file.path);
      if (loadToken !== this._loadCounter) return;
      this._setAlbumCover(cover);

      // Cache the metadata for future switches
      if (tags) {
        this._trackMetaCache.set(filePath, {
          tags: tags,
          cover: cover,
          timestamp: Date.now()
        });
        // Evict oldest entry if cache exceeds max size
        if (this._trackMetaCache.size > this._TRACK_CACHE_MAX) {
          const oldest = this._trackMetaCache.keys().next().value;
          this._trackMetaCache.delete(oldest);
        }
      }

      if (AQUE.State.currentLyrics.length === 0) {
        const extLrc = await AQUE.API.readLrc(file.path);
        if (loadToken !== this._loadCounter) return;
        if (extLrc) {
          lrcText = extLrc;
          AQUE.State.currentLyrics = AQUE.Utils.parseLRC(lrcText);
        }
      }
    }
    
    if (loadToken !== this._loadCounter) return;
    this.setTrackInfo(title, artist);

    // 标签读取完成后更新 Media Session 元数据（覆盖初始文件名）
    if (navigator.mediaSession) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: title || AQUE.Utils.stripExtension(file.name),
        artist: artist || '未知艺术家',
        album: file.album || '',
        artwork: [],
      });
    }

    const tracks = AQUE.Playlist.getTracks();
    if (AQUE.State.currentPlayingIndex >= 0 && AQUE.State.currentPlayingIndex < tracks.length) {
      tracks[AQUE.State.currentPlayingIndex].title = title;
      tracks[AQUE.State.currentPlayingIndex].artist = artist;
    }

    AQUE.Lyrics.render();

    if (AQUE.State.autoOnlineLyrics && AQUE.State.currentLyrics.length === 0 && AQUE.API.isElectron && file.path) {
      AQUE.Lyrics.searchOnline(artist || '', title || AQUE.Utils.stripExtension(file.name), loadToken);
    }
  },

  _setupMediaSession(file) {
    if (!navigator.mediaSession) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: AQUE.Utils.stripExtension(file.name),
      artist: this._songArtist.innerText,
      album: '',
      artwork: [],
    });
    navigator.mediaSession.playbackState = 'playing';
    navigator.mediaSession.setActionHandler('play', () => {
      if (AQUE.API.isElectron) AQUE.API.audioPlay();
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      if (AQUE.API.isElectron) AQUE.API.audioPause();
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => this.prev());
    navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (AQUE.API.isElectron && details.seekTime) AQUE.API.audioSeek(details.seekTime);
    });

    if (AQUE.API.isElectron && file.path) {
      this._updateSMTC(file);
    }
  },

  async _updateSMTC(file) {
    try {
      const title = this._songTitle.innerText || AQUE.Utils.stripExtension(file.name);
      const artist = this._songArtist.innerText || 'Unknown Artist';
      let cover = null;
      try {
        cover = await AQUE.API.readCover(file.path);
      } catch {}
      AQUE.API.smtcUpdate({
        title,
        artist,
        album: '',
        cover,
        state: 'playing',
        position: 0,
        duration: AQUE.State.currentDuration || 0
      });
    } catch (err) {
      console.warn('[SMTC] Failed to update:', err.message);
    }
  },

  updatePosition(data) {
    const bottomTimecode = document.getElementById('bottom-timecode');
    if (bottomTimecode) bottomTimecode.innerText = AQUE.Utils.formatTime(data.position);
    this._durationTimer.innerText = AQUE.Utils.formatTime(data.length);
    AQUE.State.currentDuration = data.length;

    if (AQUE.API.isElectron && this._statsTrackPath && !this._statsRecorded) {
      if (data.state === 'playing') {
        const now = Date.now();
        if (this._lastPositionUpdate > 0) {
          const elapsed = (now - this._lastPositionUpdate) / 1000;
          this._playedDuration += Math.max(0, elapsed - Math.abs(data.position - this._lastPositionUpdate) * 0.5);
        }
        this._lastPositionUpdate = now;

        if (this._playedDuration >= Math.min(30, data.length * 0.5)) {
          this._statsRecorded = true;
          AQUE.API.recordPlayback(this._statsTrackPath);
        }
      } else if (data.state === 'paused') {
        this._lastPositionUpdate = 0;
      }
    }

    AQUE.State.isPlaying = (data.state === 'playing');
    AQUE.Visualizer.setPlaying(AQUE.State.isPlaying);

    this._playIcon.className = AQUE.State.isPlaying
      ? 'ph-fill ph-pause text-2xl'
      : 'ph-fill ph-play text-2xl';

    window.AQUE_Progress = data.length > 0 ? (data.position / data.length) : 0;

    if (navigator.mediaSession) {
      navigator.mediaSession.playbackState = AQUE.State.isPlaying ? 'playing' : 'paused';
      if (data.length > 0 && navigator.mediaSession.setPositionState) {
        navigator.mediaSession.setPositionState({
          duration: data.length,
          playbackRate: 1,
          position: data.position,
        });
      }
    }

    let currentLineIdx = -1;
    const lyr = AQUE.State.currentLyrics;
    if (lyr.length === 0) return;
    let startIdx = AQUE.State.lastLyricIdx >= 0 ? AQUE.State.lastLyricIdx : 0;
    if (startIdx > 0 && data.position < lyr[startIdx].time) startIdx = 0;
    for (let i = startIdx; i < lyr.length; i++) {
      if (data.position >= lyr[i].time) currentLineIdx = i;
      else break;
    }
    if (currentLineIdx !== -1) AQUE.Lyrics.syncScroll(currentLineIdx);
  },

  async handleStateEvent(event) {
    if (event === 'completed') {
      if (AQUE.State.playMode === 1) {
        await AQUE.API.audioSeek(0);
        AQUE.API.audioPlay();
      } else {
        this.next();
      }
    }
  },

  _setAlbumCover(coverData) {
    if (this._albumCover && this._coverPlaceholder) {
      if (coverData) {
        this._albumCover.src = coverData;
        this._albumCover.style.display = 'block';
        this._coverPlaceholder.style.display = 'none';
      } else {
        this._albumCover.src = '';
        this._albumCover.style.display = 'none';
        this._coverPlaceholder.style.display = 'flex';
      }
    }
  },
};
