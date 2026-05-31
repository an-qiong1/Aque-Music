AQUE.Lyrics = {
  _container: null,
  _wrapper: null,
  _lineCache: null,
  _resizeHandler: null,
  _resizeTimeout: null,

  init() {
    this._container = document.getElementById('lyric-container');
    this._wrapper = document.getElementById('lyric-wrapper');
    if (!this._container || !this._wrapper) {
      console.error('Lyric container or wrapper not found');
    }

    // 清理旧监听器（防止重复 init）
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
    }
    
    this._resizeHandler = () => {
      clearTimeout(this._resizeTimeout);
      this._resizeTimeout = setTimeout(() => {
        if (AQUE.State.lastLyricIdx >= 0) {
          this._container.scrollTop = 0;
          this.syncScroll(AQUE.State.lastLyricIdx);
        }
      }, 150);
    };
    window.addEventListener('resize', this._resizeHandler);
  },

  _isNewSong: false,

  render() {
    if (!this._wrapper) {
      console.error('Lyric wrapper not available');
      return;
    }
    
    if (AQUE.State.currentPlayingIndex < 0) {
      this._wrapper.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-gray-500 gap-2"><span class="ph ph-music-notes text-3xl"></span><p class="text-sm">等待播放列表...</p></div>';
      this._isNewSong = false;
      return;
    }
    
    const lyrics = AQUE.State.currentLyrics;
    
    if (lyrics.length === 0) {
      this._wrapper.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-gray-500 gap-2"><span class="ph ph-sound-x text-3xl"></span><p class="text-sm">纯音乐，无歌词</p></div>';
      this._isNewSong = true;
      return;
    }
    
    // 清空之前可能残留的"纯音乐，无歌词"空状态提示，完整重建歌词 DOM
    this._wrapper.innerHTML = '';
    
    const lines = [];
    lyrics.forEach((l) => {
      const line = document.createElement('div');
      line.className = 'lyric-line';
      
      const timeSpan = document.createElement('span');
      timeSpan.className = 'lyric-timestamp';
      timeSpan.textContent = AQUE.Utils.formatTime(l.time);
      line.appendChild(timeSpan);
      
      const textSpan = document.createElement('span');
      textSpan.className = 'lyric-text';
      textSpan.textContent = l.text;
      line.appendChild(textSpan);
      
      line.onclick = () => {
        if (AQUE.API.isElectron) AQUE.API.audioSeek(l.time);
      };
      
      this._wrapper.appendChild(line);
      lines.push(line);
    });
    this._lineCache = lines;
    
    // 新歌重置滚动
    if (this._isNewSong) {
      this._container.scrollTop = 0;
      this._isNewSong = false;
    }
  },

  syncScroll(currentLineIdx) {
    if (AQUE.State.lastLyricIdx === currentLineIdx) return;
    AQUE.State.lastLyricIdx = currentLineIdx;
    const lines = this._lineCache || this._wrapper.querySelectorAll('.lyric-line');
    const containerVisibleHeight = this._container.offsetHeight;

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      if (idx === currentLineIdx) {
        line.classList.add('active');
        const lineTop = line.offsetTop;
        const scrollTarget = lineTop - (containerVisibleHeight / 3) - 16;
        const maxScroll = this._container.scrollHeight - containerVisibleHeight;
        const clampedScroll = Math.max(0, Math.min(scrollTarget, maxScroll));
        this._container.scrollTo({ top: clampedScroll, behavior: 'smooth' });
      } else {
        line.classList.remove('active');
      }
    }
  },
};
