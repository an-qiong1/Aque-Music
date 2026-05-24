# AQUE Repair Plan Implementation Plan

> **For agentic workers:** Each task is self-contained. Use subagents to implement task-by-task.

**Goal:** Fix remaining runtime issues — enhance embedded lyrics encoding detection, remove orphaned IPC handlers, complete volume control preload/API chain (no UI).

**Architecture:** Minimal surgical patches to existing modules; no new files.

**Tech Stack:** Electron, Node.js, iconv-lite

---

### Task 1: Enhance Embedded Lyrics Encoding Detection

**Files:**
- Modify: `src/main/ipc/tags.js:9-28` — `detectAndConvertEncoding` signature + fallback order
- Modify: `src/main/ipc/tags.js:123-148` — music-metadata lyrics path with language hint
- Modify: `src/main/ipc/tags.js:66-69` — direct MP3 read path with hint

- [ ] **Step 1: Modify `detectAndConvertEncoding` to accept optional language hint**

Change lines 9-28:
```js
function detectAndConvertEncoding(buffer, hint) {
  // When hint is 'chinese', try GBK-family first, then fall through to UTF-8
  const chineseEncodings = ['gbk', 'gb2312', 'gb18030', 'big5', 'utf-16le', 'utf-16be'];
  if (hint === 'chinese') {
    for (const enc of chineseEncodings) {
      try {
        const decoded = iconv.decode(buffer, enc);
        if (!decoded.includes('\ufffd')) {
          return decoded;
        }
      } catch (e) { continue; }
    }
    return buffer.toString('utf-8');
  }
  // Original path: try UTF-8 first
  const utf8Decoded = buffer.toString('utf-8');
  if (!utf8Decoded.includes('\ufffd')) {
    return utf8Decoded;
  }
  for (const enc of chineseEncodings) {
    try {
      const decoded = iconv.decode(buffer, enc);
      if (!decoded.includes('\ufffd')) {
        return decoded;
      }
    } catch (e) { continue; }
  }
  return utf8Decoded;
}
```

- [ ] **Step 2: Pass language hint from music-metadata lyrics path**

Change line 123-148 (the `tags.lyrics` path) to pass `isChinese ? 'chinese' : undefined`:
```js
if (tags.lyrics && Array.isArray(tags.lyrics) && tags.lyrics.length > 0) {
  const lyricTag = tags.lyrics[0];
  const isChinese = lyricTag.language === 'chi' || lyricTag.language === 'zho';
  if (lyricTag.text && typeof lyricTag.text === 'string') {
    let text = lyricTag.text;
    try {
      const buffer = Buffer.from(text, 'latin1');
      const decoded = detectAndConvertEncoding(buffer, isChinese ? 'chinese' : undefined);
      if (/[\u4e00-\u9fa5]/.test(decoded) && decoded !== text) {
        text = decoded;
      }
    } catch (e) { /* fall through */ }
    lyricsContent = text;
  }
}
```

- [ ] **Step 3: Pass 'chinese' hint for encoding byte 0x00 (ISO-8859-1) in direct MP3 read**

Change line 66-69:
```js
case 0: // ISO-8859-1 -> 可能是 GBK
  lyrics = detectAndConvertEncoding(contentBuffer, 'chinese');
  break;
```

- [ ] **Step 4: Verify with app launch**

Run: `npx electron .`
Expected: App launches, no crash. Play a Chinese MP3 with embedded lyrics, check DevTools console for "[TagReader] Converted lyrics to UTF-8" log.

---

### Task 2: Remove Orphaned IPC Handlers

**Files:**
- Modify: `src/main/ipc/audio.js:48-64`

- [ ] **Step 1: Delete 5 orphaned handler blocks**

Remove the following from `audio.js`:
```js
// Lines 48-52
ipcMain.handle('audio:getFFT', () => {
  const data = audio.getFFTData();
  if (!data) return null;
  return Array.from(data);
});

// Lines 53-55
ipcMain.handle('audio:setWASAPI', (_e, enabled) => {
  audio.setWASAPIExclusive(enabled);
});

// Lines 56-58
ipcMain.handle('audio:getWASAPI', () => {
  return audio.getWASAPIExclusive();
});

// Lines 59-61
ipcMain.handle('audio:setPlaybackRate', (_e, rate) => {
  return audio.setPlaybackRate(rate);
});

// Lines 62-64
ipcMain.handle('audio:getPlaybackRate', () => {
  return audio.getPlaybackRate();
});
```

- [ ] **Step 2: Verify**

Run: `npx electron .`
Expected: App launches, no "handler already exists" or missing handler errors.

---

### Task 3: Complete Volume Control Preload + API Chain (No UI)

**Files:**
- Modify: `src/preload/index.js:27-28` — add `audioSetVolume` / `audioGetVolume`
- Modify: `src/renderer/js/api.js:38-39` — add `AQUE.API.audioSetVolume` / `audioGetVolume`

- [ ] **Step 1: Add volume APIs to preload**

At the end of the audio commands block (after `audioStop` line 25):
```js
audioSetVolume: (vol) => ipcRenderer.invoke('audio:setVolume', vol),
audioGetVolume: () => ipcRenderer.invoke('audio:getVolume'),
```

- [ ] **Step 2: Add volume API wrappers to AQUE.API**

At the end of the audio methods block (after `audioSeek` line 39):
```js
audioSetVolume(v) { if (this.isElectron) return window.electronAPI.audioSetVolume(v); },
audioGetVolume() { if (this.isElectron) return window.electronAPI.audioGetVolume(); return Promise.resolve(0.8); },
```

- [ ] **Step 3: Verify**

Open DevTools console, run:
```js
AQUE.API.audioSetVolume(0.5).then(() => AQUE.API.audioGetVolume()).then(v => console.log('Volume:', v));
```
Expected: Console logs "Volume: 0.5"
