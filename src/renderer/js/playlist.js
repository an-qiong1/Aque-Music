AQUE.Playlist = {
  _content: null,
  _albumTabs: null,
  _searchInput: null,
  _searchFilter: '',
  _searchDebounce: null,
  _dragOverIndex: -1,
  _draggedItem: null,
  _coverObserver: null,

  init() {
    this._content = document.getElementById('playlist-content');
    this._albumTabs = document.getElementById('album-tabs');
    this._searchInput = document.getElementById('search-input');
    this._coverObserver = null;
    this._coverQueue = [];
    this._coverQueueActive = 0;
    this._coverQueueMaxConcurrent = 3;

    document.getElementById('add-btn').onclick = () => this._onAdd();
    document.getElementById('add-folder-btn').onclick = () => this._onAddFolder();
    document.getElementById('clear-list-btn').onclick = () => this._onClear();
    document.getElementById('open-playlist').onclick = () => document.getElementById('playlist-overlay').classList.add('open');
    document.getElementById('close-playlist').onclick = () => document.getElementById('playlist-overlay').classList.remove('open');
    document.getElementById('album-ok').onclick = () => this._onCreateAlbum();
    document.getElementById('album-cancel').onclick = () => document.getElementById('album-modal').classList.add('hidden');
    document.getElementById('audio-upload').onchange = (e) => this._onFileUpload(e);

    this._searchInput.addEventListener('input', (e) => {
      this._searchFilter = e.target.value.trim().toLowerCase();
      if (this._searchDebounce) clearTimeout(this._searchDebounce);
      this._searchDebounce = setTimeout(() => this._renderList(), 300);
    });

    this._content.addEventListener('dragover', (e) => this._onDragOver(e));
    this._content.addEventListener('dragleave', () => this._onDragLeave());
    this._content.addEventListener('drop', (e) => this._onDrop(e));
  },

  getTracks() {
    return AQUE.State.getTracks();
  },

  removeTrack(index) {
    const tracks = this.getTracks();
    if (index < 0 || index >= tracks.length) return;

    tracks.splice(index, 1);
    AQUE.Player.resetShuffleQueue();

    if (AQUE.State.currentPlayingIndex === index) {
      AQUE.API.audioStop();
      AQUE.State.setCurrentPlayingIndex(-1);
      AQUE.State.currentLyrics = [];
      AQUE.State.lastLyricIdx = -1;
      AQUE.Player.setTrackInfo('准备就绪', '载入音频文件开始播放');
      const bottomTimecode = document.getElementById('bottom-timecode');
      if (bottomTimecode) bottomTimecode.innerText = '0:00';
      document.getElementById('duration-timer').innerText = '0:00';
      AQUE.Lyrics.render();
    } else if (AQUE.State.currentPlayingIndex > index) {
      AQUE.State.setCurrentPlayingIndex(AQUE.State.currentPlayingIndex - 1);
    }

    this._renderList();
    this._save();
  },

  updatePlayingIndexAfterMove(from, to) {
    if (AQUE.State.currentPlayingIndex === from) {
      AQUE.State.setCurrentPlayingIndex(to);
    } else if (AQUE.State.currentPlayingIndex > from && AQUE.State.currentPlayingIndex <= to) {
      AQUE.State.setCurrentPlayingIndex(AQUE.State.currentPlayingIndex - 1);
    } else if (AQUE.State.currentPlayingIndex < from && AQUE.State.currentPlayingIndex >= to) {
      AQUE.State.setCurrentPlayingIndex(AQUE.State.currentPlayingIndex + 1);
    }
  },

  _save() {
    AQUE.API.playlistSave({
      albums: AQUE.State.albums,
      activeAlbumIndex: AQUE.State.activeAlbumIndex,
      currentPlayingIndex: AQUE.State.currentPlayingIndex,
      libraryFolders: AQUE.State.libraryFolders,
      autoOnlineLyrics: AQUE.State.autoOnlineLyrics,
    }).catch(() => {});
  },

  render() {
    this._renderList();
    this._renderAlbums();
  },

  _getFilteredTracks() {
    const tracks = this.getTracks();
    if (!this._searchFilter) return tracks;
    return tracks.filter(t => {
      const title = (t.title || t.name || '').toLowerCase();
      const artist = (t.artist || '').toLowerCase();
      const album = (t.album || '').toLowerCase();
      return title.includes(this._searchFilter) || artist.includes(this._searchFilter) || album.includes(this._searchFilter);
    });
  },

  _renderEmptyState() {
    const empty = document.createElement('div');
    empty.className = 'playlist-empty-state';

    const icon = document.createElement('i');
    icon.className = 'ph ph-folder-open playlist-empty-icon';
    empty.appendChild(icon);

    const title = document.createElement('div');
    title.className = 'playlist-empty-title';
    title.textContent = '还没有音乐';
    empty.appendChild(title);

    const desc = document.createElement('div');
    desc.className = 'playlist-empty-desc';
    desc.textContent = '拖入音频文件，或选择文件夹建立本地音乐库。';
    empty.appendChild(desc);

    this._content.appendChild(empty);
  },

  _appendHighlightedText(parent, text, query) {
    const source = String(text || '');
    const needle = String(query || '').toLowerCase();
    if (!needle) {
      parent.textContent = source;
      return;
    }

    const lower = source.toLowerCase();
    const matchIndex = lower.indexOf(needle);
    if (matchIndex === -1) {
      parent.textContent = source;
      return;
    }

    parent.appendChild(document.createTextNode(source.slice(0, matchIndex)));
    const highlight = document.createElement('span');
    highlight.className = 'playlist-highlight';
    highlight.textContent = source.slice(matchIndex, matchIndex + query.length);
    parent.appendChild(highlight);
    parent.appendChild(document.createTextNode(source.slice(matchIndex + query.length)));
  },

  _dedupeTracks() {
    for (const album of AQUE.State.albums) {
      const seen = new Set();
      album.tracks = album.tracks.filter(t => {
        const key = (t.path || t.name || '').toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
  },

  async _renderList() {
    // 去重：同路径文件只保留第一个
    this._dedupeTracks();

    const allTracks = this.getTracks();
    const filtered = this._getFilteredTracks();
    const isFiltering = this._searchFilter.length > 0;

    if (allTracks.length === 0) {
      this._content.innerHTML = '';
      this._renderEmptyState();
      return;
    }

    if (isFiltering && filtered.length === 0) {
      this._content.innerHTML = '<div class="p-8 text-center text-gray-600 text-[11px]">未找到匹配的音频</div>';
      return;
    }

    const displayList = isFiltering ? filtered : allTracks;
    const PLACEHOLDER_SVG = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23374151"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>';

    // Build map of existing children by track-key for incremental DOM reuse
    const existingItems = new Map();
    const children = Array.from(this._content.children);
    for (const child of children) {
      const key = child.dataset.trackKey;
      if (key) existingItems.set(key, child);
    }

    const fragment = document.createDocumentFragment();

    for (let displayIdx = 0; displayIdx < displayList.length; displayIdx++) {
      const file = displayList[displayIdx];
      const trackKey = (file.path || file.name).toLowerCase();
      const realIdx = isFiltering ? allTracks.findIndex(t => (t.path || t.name) === (file.path || file.name)) : displayIdx;
      const isNowPlaying = realIdx === AQUE.State.currentPlayingIndex;
      const isMissing = !!file.missing;

      let item = existingItems.get(trackKey);
      if (item) {
        // === REUSE existing DOM node ===
        existingItems.delete(trackKey);

        // Update dynamic classes
        item.className = 'playlist-item';
        if (isNowPlaying) item.classList.add('now-playing');
        if (isMissing) item.classList.add('missing');

        // Reset cover lazy-load if path changed
        const coverImg = item.querySelector('.playlist-cover');
        if (coverImg) {
          if (coverImg.dataset.coverPath !== (file.path || '')) {
            coverImg.dataset.coverPath = file.path || '';
            delete coverImg.dataset.coverLoaded;
            coverImg.src = PLACEHOLDER_SVG;
          }
        }

        // Update info section
        const infoDiv = item.querySelector('.playlist-info');
        if (infoDiv) {
          // Title with search highlight
          let titleDiv = infoDiv.querySelector('.playlist-title');
          if (titleDiv) {
            titleDiv.innerHTML = '';
          } else {
            titleDiv = document.createElement('div');
            titleDiv.className = 'playlist-title';
            infoDiv.insertBefore(titleDiv, infoDiv.firstChild);
          }
          this._appendHighlightedText(
            titleDiv,
            file.title || AQUE.Utils.stripExtension(file.name),
            isFiltering ? this._searchFilter : ''
          );

          // Artist
          let artistDiv = infoDiv.querySelector('.playlist-artist');
          if (file.artist) {
            if (!artistDiv) {
              artistDiv = document.createElement('div');
              artistDiv.className = 'playlist-artist';
              infoDiv.appendChild(artistDiv);
            }
            artistDiv.innerText = file.artist;
          } else if (artistDiv) {
            artistDiv.remove();
          }
        }

        // Update duration
        let durSpan = item.querySelector('.playlist-duration');
        if (file.duration > 0) {
          if (!durSpan) {
            durSpan = document.createElement('span');
            durSpan.className = 'playlist-duration';
            item.appendChild(durSpan);
          }
          durSpan.innerText = AQUE.Utils.formatTime(file.duration);
        } else if (durSpan) {
          durSpan.remove();
        }

        // Re-assign event handlers (realIdx may have changed after reorder)
        item.onclick = () => { AQUE.Player.playTrack(realIdx); };
        item.oncontextmenu = (e) => {
          e.preventDefault();
          this.removeTrack(realIdx);
          AQUE.Utils.showToast('已移除', 800);
        };
        item.ondragstart = (e) => this._onDragStart(e, realIdx);
        item.ondragend = () => this._onDragEnd();
        item.draggable = true;
      } else {
        // === CREATE new DOM node ===
        item = document.createElement('div');
        item.dataset.trackKey = trackKey;
        item.className = 'playlist-item';
        if (isNowPlaying) item.classList.add('now-playing');
        if (isMissing) item.classList.add('missing');

        // Cover with lazy-load placeholder (no IPC call here)
        const coverWrapper = document.createElement('div');
        coverWrapper.className = 'playlist-cover-wrapper';
        const coverImg = document.createElement('img');
        coverImg.className = 'playlist-cover';
        coverImg.src = PLACEHOLDER_SVG;
        if (AQUE.API.isElectron && file.path) {
          coverImg.dataset.coverPath = file.path;
        }
        coverWrapper.appendChild(coverImg);
        item.appendChild(coverWrapper);

        // Info
        const infoDiv = document.createElement('div');
        infoDiv.className = 'playlist-info';
        const titleDiv = document.createElement('div');
        titleDiv.className = 'playlist-title';
        this._appendHighlightedText(
          titleDiv,
          file.title || AQUE.Utils.stripExtension(file.name),
          isFiltering ? this._searchFilter : ''
        );
        infoDiv.appendChild(titleDiv);
        if (file.artist) {
          const artistDiv = document.createElement('div');
          artistDiv.className = 'playlist-artist';
          artistDiv.innerText = file.artist;
          infoDiv.appendChild(artistDiv);
        }
        item.appendChild(infoDiv);

        // Duration
        if (file.duration > 0) {
          const durSpan = document.createElement('span');
          durSpan.className = 'playlist-duration';
          durSpan.innerText = AQUE.Utils.formatTime(file.duration);
          item.appendChild(durSpan);
        }

        // Handlers
        item.onclick = () => { AQUE.Player.playTrack(realIdx); };
        item.oncontextmenu = (e) => {
          e.preventDefault();
          this.removeTrack(realIdx);
          AQUE.Utils.showToast('已移除', 800);
        };
        item.ondragstart = (e) => this._onDragStart(e, realIdx);
        item.ondragend = () => this._onDragEnd();
        item.draggable = true;
      }

      fragment.appendChild(item);
    }

    // Remove DOM nodes for tracks no longer in the display list
    for (const [, extra] of existingItems) {
      extra.remove();
    }

    // Replace content preserving correct order (fragment batches reflow)
    this._content.innerHTML = '';
    this._content.appendChild(fragment);

    // Set up IntersectionObserver for lazy cover loading
    this._setupLazyCovers();
  },

  _setupLazyCovers() {
    // Disconnect previous observer before re-creating
    if (this._coverObserver) this._coverObserver.disconnect();

    this._coverObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const img = entry.target;
          const path = img.dataset.coverPath;
          if (!path || img.dataset.coverQueued) continue;
          img.dataset.coverQueued = '1';
          this._coverQueue.push(img);
          this._processCoverQueue();
          this._coverObserver.unobserve(img);
        }
      }
    }, { rootMargin: '200px 0px' });

    this._content.querySelectorAll('.playlist-cover[data-cover-path]').forEach(img => {
      if (!img.dataset.coverQueued) {
        this._coverObserver.observe(img);
      }
    });
  },

  _processCoverQueue() {
    while (this._coverQueueActive < this._coverQueueMaxConcurrent && this._coverQueue.length > 0) {
      const img = this._coverQueue.shift();
      if (!img || !img.isConnected) continue;
      this._coverQueueActive++;
      this._loadSingleCover(img).finally(() => {
        this._coverQueueActive--;
        this._processCoverQueue();
      });
    }
  },

  async _loadSingleCover(img) {
    const path = img.dataset.coverPath;
    if (!path) return;

    const cached = AQUE.CoverCache.get(path);
    if (cached) {
      img.src = cached;
      return;
    }

    try {
      const data = await AQUE.API.readCover(path);
      if (data && img.dataset.coverPath === path && img.isConnected) {
        img.src = data;
      }
    } catch (e) {
      // Silently fail, placeholder remains
    }
  },

  _onDragStart(e, index) {
    this._draggedItem = index;
    e.dataTransfer.effectAllowed = 'move';
    e.target.classList.add('dragging');
  },

  _onDragEnd() {
    this._draggedItem = null;
    this._dragOverIndex = -1;
    this._content.querySelectorAll('.playlist-item').forEach(item => {
      item.classList.remove('dragging', 'drag-over');
    });
    this._renderList();
  },

  _onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const tracks = this.getTracks();
    const items = this._content.querySelectorAll('[draggable="true"]');
    items.forEach((item, idx) => {
      const rect = item.getBoundingClientRect();
      const y = e.clientY;
      if (y >= rect.top && y <= rect.bottom) {
        this._dragOverIndex = tracks.length > idx ? idx : tracks.length - 1;
        item.classList.add('drag-over');
      } else {
        item.classList.remove('drag-over');
      }
    });
  },

  _onDragLeave() {
    this._dragOverIndex = -1;
    document.querySelectorAll('.drag-over').forEach(item => {
      item.classList.remove('drag-over');
    });
  },

  _onDrop(e) {
    e.preventDefault();
    if (this._draggedItem === null || this._dragOverIndex === -1) return;
    
    const tracks = this.getTracks();
    const draggedTrack = tracks[this._draggedItem];
    const from = this._draggedItem;
    const to = from < this._dragOverIndex ? this._dragOverIndex - 1 : this._dragOverIndex;
    
    tracks.splice(from, 1);
    tracks.splice(to, 0, draggedTrack);
    
    this.updatePlayingIndexAfterMove(from, to);
    AQUE.Player.resetShuffleQueue();
    
    this._dragOverIndex = -1;
    this._draggedItem = null;
    this._renderList();
    this._save();
  },

  _renderAlbums() {
    this._albumTabs.innerHTML = '';
    AQUE.State.albums.forEach((album, idx) => {
      const tab = document.createElement('div');
      tab.className = `px-4 py-2 text-[10px] cursor-pointer whitespace-nowrap border-r border-white/5 ${idx === AQUE.State.activeAlbumIndex ? 'bg-[#2b2b2b] text-white border-b-2 border-b-emerald-500' : 'text-gray-500 hover:text-gray-300'}`;
      tab.innerText = album.name;
      tab.onclick = () => {
        AQUE.State.activeAlbumIndex = idx;
        AQUE.Player.resetShuffleQueue();
        this._searchFilter = '';
        this._searchInput.value = '';
        this._renderAlbums();
        this._renderList();
        this._save();
      };
      this._albumTabs.appendChild(tab);
    });
    const add = document.createElement('div');
    add.className = 'px-4 py-2 text-[10px] text-emerald-500 cursor-pointer font-bold';
    add.innerText = '+';
    add.onclick = () => document.getElementById('album-modal').classList.remove('hidden');
    this._albumTabs.appendChild(add);
  },

  async _onAdd() {
    if (AQUE.API.isElectron) {
      const files = await AQUE.API.openFiles();
      if (!files || files.length === 0) return; // 取消对话框不做任何操作
      const tracks = this.getTracks();
      for (const filePath of files) {
        if (AQUE.Utils.trackExistsInAlbums(filePath)) continue;
        tracks.push({ name: AQUE.Utils.basename(filePath), path: filePath });
      }
      this._renderList();
      this._save();
    } else {
      document.getElementById('audio-upload').click();
    }
  },

  async _onAddFolder() {
    if (!AQUE.API.isElectron) return;
    const folderPath = await AQUE.API.openFolder();
    if (!folderPath) return;
    if (!AQUE.State.libraryFolders.includes(folderPath)) {
      AQUE.State.libraryFolders.push(folderPath);
    }
    const index = await AQUE.API.buildLibraryIndex(AQUE.State.libraryFolders);
    const files = index && Array.isArray(index.tracks) ? index.tracks : await AQUE.API.scanFolder(folderPath);
    const tracks = this.getTracks();
    let added = 0;
    for (const file of files) {
      if (AQUE.Utils.trackExistsInAlbums(file.path)) continue;
      tracks.push({
        name: file.name,
        path: file.path,
        title: file.title || AQUE.Utils.stripExtension(file.name),
        artist: file.artist || '',
        album: file.album || '',
        duration: file.duration || 0,
      });
      added++;
    }
    AQUE.API.watchFolder(folderPath);
    this._renderList();
    this._save();
    AQUE.Utils.showToast('已导入 ' + added + ' 首歌曲', 2000);
  },

  _onClear() {
    // 清空所有专辑的全部曲目
    let total = 0;
    for (const album of AQUE.State.albums) {
      total += album.tracks.length;
      album.tracks.length = 0;
    }
    if (total === 0) return;
    AQUE.Player._trackMetaCache.clear();
    AQUE.Player.resetShuffleQueue();
    AQUE.Player.clearHistory();
    if (AQUE.API.isElectron) AQUE.API.audioStop();
    AQUE.State.setCurrentPlayingIndex(-1);
    AQUE.State.currentLyrics = [];
    AQUE.State.lastLyricIdx = -1;
    AQUE.Player.setTrackInfo('准备就绪', '载入音频文件开始播放');
    const bottomTimecode = document.getElementById('bottom-timecode');
    if (bottomTimecode) bottomTimecode.innerText = '0:00';
    document.getElementById('duration-timer').innerText = '0:00';
    this._renderList();
    this._save();
    AQUE.Lyrics.render();
    AQUE.Utils.showToast('列表已清空', 1200);
  },

  _onCreateAlbum() {
    const name = document.getElementById('new-album-name').value;
    if (name) {
      AQUE.State.albums.push({ name, tracks: [] });
      AQUE.State.activeAlbumIndex = AQUE.State.albums.length - 1;
      this._searchFilter = '';
      this._searchInput.value = '';
      this._renderAlbums();
      this._renderList();
      this._save();
      document.getElementById('album-modal').classList.add('hidden');
      document.getElementById('new-album-name').value = '';
    }
  },

  _onFileUpload(e) {
    if (!AQUE.API.isElectron) {
      const tracks = this.getTracks();
      for (const f of Array.from(e.target.files)) {
        if (tracks.some(t => t.name === f.name && t.size === f.size)) continue;
        tracks.push(f);
      }
      AQUE.Player.resetShuffleQueue();
      this._renderList();
      this._save();
    }
  },
};
