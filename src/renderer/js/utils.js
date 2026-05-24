window.AQUE = window.AQUE || {};

AQUE.Utils = {
  formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  },

  parseLRC(lrc) {
    if (!lrc || typeof lrc !== 'string') return [];
    const lines = lrc.split('\n');
    const result = lines
      .map((line) => {
        let match;
        match = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/.exec(line);
        if (match) {
          const t = parseInt(match[1]) * 60 + parseInt(match[2]) + parseInt(match[3]) / (match[3].length === 3 ? 1000 : 100);
          const text = line.replace(/\[.*?\]/g, '').trim();
          if (text) return { time: t, text };
        }
        match = /\[(\d{2}):(\d{2})\.(\d{2})\]/.exec(line);
        if (match) {
          const t = parseInt(match[1]) * 60 + parseInt(match[2]) + parseInt(match[3]) / 100;
          const text = line.replace(/\[.*?\]/g, '').trim();
          if (text) return { time: t, text };
        }
        match = /\[(\d{2}):(\d{2})\]/.exec(line);
        if (match) {
          const t = parseInt(match[1]) * 60 + parseInt(match[2]);
          const text = line.replace(/\[.*?\]/g, '').trim();
          if (text) return { time: t, text };
        }
        return null;
      })
      .filter(x => x && x.text && x.text.length > 0);
    return result.sort((a, b) => a.time - b.time);
  },
};

AQUE.Utils.stripExtension = function (filename) {
  return filename.replace(/\.[^/.]+$/, '');
};

AQUE.Utils.basename = function (path) {
  return path.split(/[\\/]/).pop();
};

AQUE.Utils.findTrackAcrossAlbums = function (filePath) {
  const lowerPath = filePath.toLowerCase();
  for (let i = 0; i < AQUE.State.albums.length; i++) {
    const album = AQUE.State.albums[i];
    const idx = album.tracks.findIndex(t => t.path.toLowerCase() === lowerPath);
    if (idx !== -1) return { albumIndex: i, trackIndex: idx };
  }
  return null;
};

AQUE.Utils.trackExistsInAlbums = function (filePath) {
  return AQUE.Utils.findTrackAcrossAlbums(filePath) !== null;
};

AQUE.Utils.showToast = function (text, duration) {
  const toast = document.getElementById('mode-toast');
  if (!toast) return;
  if (toast._hideTimeout) clearTimeout(toast._hideTimeout);
  toast.innerText = text;
  toast.style.opacity = '1';
  if (duration > 0) {
    toast._hideTimeout = setTimeout(() => {
      toast.style.opacity = '0';
    }, duration);
  }
};
