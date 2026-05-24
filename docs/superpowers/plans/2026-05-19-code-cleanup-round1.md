# AQUE 代码清理与重构计划（第1轮）

> **For agentic workers:** 使用子代理或内联执行逐任务实现。步骤使用 `- [ ]` 语法追踪。

**目标:** 修复当前代码库中发现的 44 个问题，包括死代码清理、重复实现合并、运行时 bug 修复、状态管理统一。

**架构:** 分 7 个阶段渐进式重构，每阶段独立可测试，低风险从清理开始逐步向核心逻辑推进。

**执行原则:**
- 每完成一个 Task 立刻运行应用验证不崩溃
- 不改变现有功能行为，仅重构/清理
- 保持 `AQUE.ModuleName` 模块命名模式一致

---

## 阶段 0：前置准备

### Task 0.1：阅读当前代码快照，确认基线状态

- [ ] 快速浏览关键文件确保对当前代码版本理解一致：
  - `src/renderer/js/player.js`（智能检测逻辑）
  - `src/main/ipc/files.js`（内联扫描器）
  - `src/main/library/scanner.js`（正式扫描器）
  - `src/main/audio/service.js`（dispose 方法）
  - `src/main/utils/tray.js`（退出逻辑）
  - `src/main/ipc/window.js`（maximizeChange 发送）
  - `src/main/window.js`（原生 maximize 事件监听）
  - `src/renderer/js/visualizer.js`（top-waveform 空转 + Canvas DPR）
  - `src/renderer/js/cover.js`（死代码）
  - `src/renderer/css/style.css`（死样式）

运行: `npx electron .` 确保应用正常启动

---

## 阶段 1：死代码清理（安全，无副作用）

### Task 1.1：移除 `cover.js` 及相关引用

**文件:**
- Delete: `src/renderer/js/cover.js`
- Modify: `src/renderer/index.html`

- [ ] **删除 `cover.js` 文件**

```bash
Remove-Item -LiteralPath "src/renderer/js/cover.js"
```

- [ ] **从 index.html 移除 cover.js 的 script 标签**

在 `src/renderer/index.html` 中找到并删除：
```html
<script src="js/cover.js"></script>
```

- [ ] **验证**

运行 `npx electron .`，确认无 `require` 错误，功能正常。

---

### Task 1.2：移除 `#top-waveform` 空转代码及 CSS

**文件:**
- Modify: `src/renderer/js/visualizer.js`

- [ ] **从 `_loop()` 中移除 `_drawTopWaveform()` 调用**

在 `src/renderer/js/visualizer.js` 中找到 `_loop` 方法，删除或注释掉：
```js
// 删除该行:
this._drawTopWaveform();
```

- [ ] **删除 `_drawTopWaveform()` 方法**

删除 `visualizer.js` 中 `_drawTopWaveform()` 方法的完整实现。

- [ ] **从 style.css 移除 `#top-waveform` 相关 CSS**

在 `src/renderer/css/style.css` 中找到 `#top-waveform` 规则块并删除：
```css
#top-waveform {
  /* ... 全部删除 */
}
```

- [ ] **验证**

运行 `npx electron .`，打开 DevTools Console，确认无 `top-waveform` 相关错误，可视化功能正常。

---

### Task 1.3：移除 CSS 中 `#seek-bar` / `#seek-progress` / `#seek-thumb` 死样式

**文件:**
- Modify: `src/renderer/css/style.css`

- [ ] **删除死 CSS 规则**

在 `style.css` 中找到 `#seek-bar`、`#seek-progress`、`#seek-thumb` 三个选择器的全部样式规则并删除。

- [ ] **验证**

确认应用启动正常，底部波形进度条功能（`#podcast-waveform`）不受影响。

---

### Task 1.4：归档废弃的调试/测试/原型文件

**文件:**
- Move to archive: `debug-flow.js`, `test-separator.js`, `test-smart-detect.js`, `UI.html`

- [ ] **创建归档目录并移动文件**

```bash
New-Item -ItemType Directory -Path "archive" -Force
Move-Item -LiteralPath "debug-flow.js" -Destination "archive/debug-flow.js"
Move-Item -LiteralPath "test-separator.js" -Destination "archive/test-separator.js"
Move-Item -LiteralPath "test-smart-detect.js" -Destination "archive/test-smart-detect.js"
Move-Item -LiteralPath "UI.html" -Destination "archive/UI.html"
```

- [ ] **更新 .gitignore**

在项目 `.gitignore` 中添加 `archive/` 目录（如果要保留在 git 中则不添加）。

- [ ] **验证**

确认应用启动正常，功能不变。

---

## 阶段 2：提取共享工具方法（消除重复模式）

### Task 2.1：为渲染进程添加通用工具方法

**文件:**
- Modify: `src/renderer/js/utils.js`

- [ ] **添加 `stripExtension(filename)` 方法**

```js
AQUE.Utils.stripExtension = function (filename) {
  return filename.replace(/\.[^/.]+$/, '');
};
```

- [ ] **添加 `basename(path)` 方法**

```js
AQUE.Utils.basename = function (path) {
  return path.split(/[\\/]/).pop();
};
```

- [ ] **验证**

打开页面，在 DevTools 中测试 `AQUE.Utils.stripExtension('song.mp3')` → `'song'`，`AQUE.Utils.basename('a/b/c.mp3')` → `'c.mp3'`。

---

### Task 2.2：全局替换为统一工具方法（扩展名剥离）

**文件:**
- Modify: `src/renderer/js/player.js`
- Modify: `src/renderer/js/playlist.js`
- Modify: `src/renderer/js/app.js`

- [ ] **替换 player.js 中 3 处扩展名剥离**

第 148 行：
```js
// 旧:
const rawTitle = file.name.replace(/\.[^/.]+$/, '');
// 新:
const rawTitle = AQUE.Utils.stripExtension(file.name);
```

第 222 行：
```js
// 旧:
const rawTagTitle = file.name.replace(/\.[^/.]+$/, '');
// 新:
const rawTagTitle = AQUE.Utils.stripExtension(file.name);
```

第 378 行：
```js
// 旧:
const rawTitle = file.name.replace(/\.[^/.]+$/, '');
// 新:
const rawTitle = AQUE.Utils.stripExtension(file.name);
```

- [ ] **替换 playlist.js 中 1 处**

第 100 行：
```js
// 旧:
file.name.replace(/\.[^/.]+$/, '')
// 新:
AQUE.Utils.stripExtension(file.name)
```

- [ ] **替换 app.js 中 1 处**

第 86 行：
```js
// 旧:
name.replace(/\.[^/.]+$/, '')
// 新:
AQUE.Utils.stripExtension(name)
```

- [ ] **验证**

运行 `npx electron .`，导入歌曲播放，确认文件名显示（去除扩展名）功能正常。

---

### Task 2.3：全局替换为统一工具方法（路径 basename）

**文件:**
- Modify: `src/renderer/js/playlist.js`
- Modify: `src/renderer/js/app.js`

- [ ] **替换 playlist.js 中 1 处**

第 242 行：
```js
// 旧:
const fileName = filePath.split(/[\\/]/).pop();
// 新:
const fileName = AQUE.Utils.basename(filePath);
```

- [ ] **替换 app.js 中 1 处**

第 84 行：
```js
// 旧:
const fileName = data.filePath.split(/[\\/]/).pop();
// 新:
const fileName = AQUE.Utils.basename(data.filePath);
```

- [ ] **验证**

运行应用，确认文件夹扫描/添加文件时的文件名显示正常。

---

### Task 2.4：playlist.js 时间格式化改用工具方法

**文件:**
- Modify: `src/renderer/js/playlist.js`

- [ ] **替换内联时间格式化**

找到 `playlist.js` 第 121-123 行：
```js
// 旧:
const m = Math.floor(file.duration / 60);
const s = Math.floor(file.duration % 60);
durSpan.innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
// 新:
durSpan.innerText = AQUE.Utils.formatTime(file.duration);
```

- [ ] **验证**

运行应用，导入有 duration 元数据的歌曲，确认列表中时长格式正确。

---

### Task 2.5：提取 Canvas DPR 设置辅助方法

**文件:**
- Modify: `src/renderer/js/visualizer.js`

- [ ] **在 visualizer 模块添加 `_setupCanvas(canvas)` 方法**

```js
AQUE.Visualizer._setupCanvas = function (canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== w * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext('2d');
  ctx.resetTransform();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  return ctx;
};
```

- [ ] **替换 `_drawStaticWave()` 中的 7 行模板**

将原有 7 行 Canvas 设置代码替换为：
```js
const ctx = AQUE.Visualizer._setupCanvas(canvas);
```

- [ ] **替换 `_animateDynamicVisualizer()` 中的 7 行模板**

同样替换为 `_setupCanvas(canvas)` 调用。

- [ ] **替换 `_drawTopWaveform()`（如果尚未删除）**

同样替换。

- [ ] **验证**

运行应用，播放音乐查看频谱可视化/波形进度条是否正常。

---

## 阶段 3：修复主进程重复实现

### Task 3.1：`ipc/files.js` 改用 `scanner.scanFolder()` 而非内联

**文件:**
- Modify: `src/main/ipc/files.js`
- Modify: `src/main/ipc/register.js`（确保 scanner 传入 deps）

- [ ] **确认 scanner 已被注入到 `ipc/files.js`**

检查 `src/main/ipc/register.js` 中 `registerAll(deps)` 是否将 `deps.scanner` 传入 `files.register()`。

如果未传入，修改 `register.js` 使其注入：
```js
// 在 registerAll 中找到:
require('./files').register(ipcMain, { /* ... 已有参数 ... */, scanner: deps.scanner });
```

- [ ] **替换 `ipc/files.js` 中的内联 walk() 函数**

移除 `fs:scanFolder` handler 中的 `walk()` 内联函数定义，改为调用 `scanner.scanFolder()`：
```js
const { scanner } = options;
// ...
ipcMain.handle('fs:scanFolder', async (event, folderPath) => {
  try {
    return await scanner.scanFolder(folderPath);
  } catch (err) {
    console.error('扫描文件夹失败:', err);
    return [];
  }
});
```

- [ ] **验证**

在应用中点击"添加文件夹"，确认扫描结果与之前一致。

---

### Task 3.2：提取共享 `music-metadata` 懒加载器

**文件:**
- Create: `src/main/utils/audio-metadata.js`
- Modify: `src/main/ipc/tags.js`
- Modify: `src/main/library/indexer.js`

- [ ] **创建共享懒加载模块 `src/main/utils/audio-metadata.js`**

```js
const path = require('path');

let _mm = null;

/**
 * 获取 music-metadata 实例（懒加载，ESM 兼容）
 */
async function getMetadata() {
  if (!_mm) {
    _mm = await import('music-metadata');
  }
  return _mm;
}

/**
 * 解析文件元数据
 * @param {string} filePath - 音频文件路径
 * @param {object} [options] - parseFile 选项
 * @returns {Promise<object>} 解析结果
 */
async function parseFile(filePath, options) {
  const mm = await getMetadata();
  return mm.parseFile(filePath, options);
}

module.exports = { getMetadata, parseFile };
```

- [ ] **修改 `ipc/tags.js` 使用共享模块**

移除第 6-8 行的 `const mmReady = import('music-metadata')` 和 `getMM` 函数。
在文件顶部添加：
```js
const { getMetadata, parseFile } = require('../utils/audio-metadata');
```

将所有 `const mm = await getMM()` 替换为 `const mm = await getMetadata()`。

- [ ] **修改 `library/indexer.js` 使用共享模块**

移除第 6-8 行的重复懒加载代码。
在文件顶部添加：
```js
const { getMetadata, parseFile } = require('../utils/audio-metadata');
```

使用 `parseFile(filePath, options)` 替换原生的 `mm.parseFile()` 调用。

- [ ] **验证**

运行 `npx electron .`，导入文件夹建立索引，然后点击歌曲读取标签——确保两者都正常且无重复加载警告。

---

### Task 3.3：修复文件对话框扩展名列表与 `AUDIO_EXTS` 同步

**文件:**
- Modify: `src/main/ipc/files.js`
- Modify: `src/main/utils/audio-formats.js`

- [ ] **从 `audio-formats.js` 导出无点扩展名数组**

```js
// 在 audio-formats.js 末尾添加:
const AUDIO_EXTS_ARRAY = Array.from(AUDIO_EXTS).map(ext => ext.slice(1));
module.exports = { isAudioFile, AUDIO_EXTS, AUDIO_EXTS_ARRAY };
```

- [ ] **修改 `ipc/files.js` 使用导出的扩展名数组**

移除内联的 `const AUDIO_EXTS = [...]` 定义，改为：
```js
const { AUDIO_EXTS_ARRAY } = require('../utils/audio-formats');
```

将 dialog 过滤器中的扩展名替换为 `AUDIO_EXTS_ARRAY`：
```js
filters: [{ name: '音频文件', extensions: AUDIO_EXTS_ARRAY }]
```

- [ ] **验证**

运行应用，打开"添加文件"对话框，确认音频过滤器仍然正确。

---

## 阶段 4：修复运行时 Bug

### Task 4.1：修复 `audio.dispose()` 双重释放

**文件:**
- Modify: `src/main/index.js`
- Modify: `src/main/utils/tray.js`

- [ ] **在 `index.js` 添加防重复释放保护**

将 `before-quit` 事件处理改为：
```js
app.on('before-quit', () => {
  app.isQuitting = true;
});
```

移除 `before-quit` 中对 `audio.dispose()` 的调用。由 `tray.js` 统一在退出前调用 `dispose()`。

- [ ] **确认 `tray.js` 的退出逻辑是唯一的 dispose 调用点**

检查 `tray.js` 中退出按钮的代码：
```js
audio.dispose();
app.quit();
```

确保 `app.quit()` 不会再次触发 dispose（`before-quit` 中已移除 dispose 调用）。

- [ ] **验证**

通过托盘右键菜单退出应用，确认进程正常终止且无错误日志。

---

### Task 4.2：修复 `window:maximizeChange` 双重发送

**文件:**
- Modify: `src/main/ipc/window.js`
- Modify: `src/main/window.js`

**方案：** 移除 IPC handler 中的手动发送，只依赖原生事件。

- [ ] **移除 `ipc/window.js` 中 `window:toggleMaximize` handler 内的 `maximizeChange` 发送**

```js
// 在 toggleMaximize handler 中，删除以下行:
// win.webContents.send('window:maximizeChange', ...);
```

- [ ] **验证**

在应用中点击最大化按钮（或在标题栏双击），确认窗口最大化/还原状态正常，且 renderer 仅收到一次 `maximizeChange` 事件。

---

### Task 4.3：修复任务栏进度条被位置轮询覆盖

**文件:**
- Modify: `src/main/ipc/audio.js`

**方案：** 区分自动进度和手动设置进度，让手动设置优先。

- [ ] **添加 `_manualProgressOverride` 标记**

在 `ipc/audio.js` 添加一个变量和超时机制：
```js
let _manualProgressTimeout = null;
```

在 `smtc:setTaskbarProgress` handler 中：
```js
ipcMain.handle('smtc:setTaskbarProgress', (event, progress) => {
  const win = getWin();
  if (win) win.setProgressBar(progress);
  // 设置一个 5 秒的覆盖期，期间不覆盖进度
  if (_manualProgressTimeout) clearTimeout(_manualProgressTimeout);
  _manualProgressTimeout = setTimeout(() => {
    _manualProgressTimeout = null;
  }, 5000);
});
```

在位置回调中更新进度条时加判断：
```js
if (!_manualProgressTimeout) {
  win.setProgressBar(position / length);
}
```

- [ ] **验证**

触发 `smtc:setTaskbarProgress`（或等待自动进度），确认进度条行为正常。

---

### Task 4.4：修复托盘菜单播放/暂停不通知渲染进程

**文件:**
- Modify: `src/main/utils/tray.js`

- [ ] **托盘菜单操作后通知渲染进程**

```js
// 在托盘 "播放/暂停" 菜单的 click 回调中:
const win = getWin();
audio.playPause();
if (win && !win.isDestroyed()) {
  win.webContents.send('shortcut:playPause');
}
```

注意：需要让 `tray.js` 能访问到 `getWin`（可从 `window.js` 导入或通过 deps 传入）。

- [ ] **验证**

通过托盘菜单播放/暂停，确认 UI 播放图标同步更新。

---

## 阶段 5：修复 DOM 与状态管理冲突

### Task 5.1：创建统一 Toast 系统

**文件:**
- Modify: `src/renderer/js/utils.js`

- [ ] **添加 `showToast(text, duration)` 方法**

```js
AQUE.Utils.showToast = function (text, duration) {
  const toast = document.getElementById('mode-toast');
  if (!toast) return;
  
  // 清除之前的超时
  if (toast._hideTimeout) clearTimeout(toast._hideTimeout);
  
  toast.innerText = text;
  toast.style.opacity = '1';
  
  toast._hideTimeout = setTimeout(() => {
    toast.style.opacity = '0';
  }, duration || 1500);
};
```

- [ ] **全局替换所有对 `#mode-toast` 的直接操作**

替换以下文件中直接操作 `#mode-toast` 的代码：

**player.js:42-45**
```js
// 旧:
document.getElementById('mode-toast').innerText = modeText;
document.getElementById('mode-toast').style.opacity = '1';
setTimeout(() => { document.getElementById('mode-toast').style.opacity = '0'; }, 1200);
// 新:
AQUE.Utils.showToast(modeText, 1200);
```

**titlebar.js:41-50**
```js
// 旧:
直接操作 toast
// 新:
AQUE.Utils.showToast(text, 1200);
```

**playlist.js**（导入、清空两处）
```js
// 旧:
直接操作 toast
// 新:
AQUE.Utils.showToast('已导入 X 首歌曲', 2000);
AQUE.Utils.showToast('列表已清空', 1200);
```

**lyrics.js:20-24**
```js
// 旧:
直接操作 toast
// 新:
AQUE.Utils.showToast('已加载在线歌词', 1500);
```

**app.js:105-107**（库索引进度——需要处理为不隐藏的情况）
```js
// 旧:
直接操作 toast（且不隐藏）
// 新:
AQUE.Utils.showToast(text, 0); // duration=0 表示不自动隐藏
```

修改 `showToast` 支持 `duration=0` 不自动隐藏：
```js
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
```

- [ ] **验证**

分别触发各种 toast（切换模式、置顶、导入歌曲、清空列表、加载歌词），确认显示/隐藏行为正确。

---

### Task 5.2：统一 `#song-title` / `#song-artist` 更新入口

**文件:**
- Modify: `src/renderer/js/player.js`
- Modify: `src/renderer/js/playlist.js`

- [ ] **在 player.js 添加公开方法 `setTrackInfo(title, artist)`**

```js
AQUE.Player.setTrackInfo = function (title, artist) {
  this._songTitle.innerText = title || '未知歌曲';
  this._songArtist.innerText = artist || '未知艺术家';
};
```

- [ ] **替换 player.js 自身对 `_songTitle` / `_songArtist` 的直接设置**

在 `playTrack()` 中找到设置标题/艺术家的代码，改为：
```js
AQUE.Player.setTrackInfo(title, artist);
```

- [ ] **替换 playlist.js 中通过 getElementById 的直接操作**

将：
```js
document.getElementById('song-title').innerText = '准备就绪';
document.getElementById('song-artist').innerText = '';
```
改为：
```js
AQUE.Player.setTrackInfo('准备就绪', '');
```

- [ ] **验证**

播放歌曲确认标题/艺术家显示正确，清空列表确认恢复默认值。

---

### Task 5.3：统一 `AQUE.State.currentPlayingIndex` 更新入口

**文件:**
- Modify: `src/renderer/js/api.js`
- Modify: `src/renderer/js/player.js`
- Modify: `src/renderer/js/playlist.js`
- Modify: `src/renderer/js/app.js`

- [ ] **在 `api.js` 中添加 `AQUE.State.setCurrentPlayingIndex(index)`**

```js
AQUE.State.setCurrentPlayingIndex = function (index) {
  this.currentPlayingIndex = index;
  // 可在此处触发统一的状态更新事件（后续使用）
};
```

- [ ] **全局替换所有 `AQUE.State.currentPlayingIndex = X` 赋值**

**player.js:95** → `AQUE.State.setCurrentPlayingIndex(index);`
**player.js:202-208** → `AQUE.State.setCurrentPlayingIndex(...);`
**playlist.js:131,271** → `AQUE.State.setCurrentPlayingIndex(-1);`
**playlist.js:97** → `AQUE.State.setCurrentPlayingIndex(...);`
**app.js:95** → `AQUE.State.setCurrentPlayingIndex(-1);`

- [ ] **验证**

运行应用，播放歌曲、切换歌曲、删除歌曲、清空列表——确认 `currentPlayingIndex` 值正确。

---

## 阶段 6：清理未使用的 Preload API

### Task 6.1：移除 preload 和 api.js 中未使用的 API

**文件:**
- Modify: `src/preload/index.js`
- Modify: `src/renderer/js/api.js`

- [ ] **列出确凿未使用的 API 并从 preload 移除**

以下 API 在渲染进程中确凿未被调用，从 `contextBridge.exposeInMainWorld` 的白名单中移除：
- `hideWindow`、`toggleMaximize`、`isMaximized`、`onMaximizeChange`
- `unwatchFolder`、`getWatchedFolders`
- `getFFT`、`setWASAPI`、`getWASAPI`、`setPlaybackRate`、`getPlaybackRate`
- `readCover`、`buildLibraryIndex`、`clearLibraryIndex`
- `getMostPlayed`、`getRecentlyPlayed`、`getStatsForTrack`、`clearStats`
- `startSleepTimer`、`stopSleepTimer`、`getSleepTimerStatus`、`onSleepTimerExpired`
- `setTaskbarProgress`

- [ ] **同步从 `AQUE.API` 中移除对应的包裹方法**

在 `api.js` 中删除已移除 API 对应的包裹方法。

- [ ] **保留 `recordPlayback`（因为有调用方）和 `readCover`（作为记录保留，但确认无调用方后也可移除）**

- [ ] **验证**

运行 `npx electron .`，确认所有现有功能（播放、列表、歌词、可视化）正常。

---

## 阶段 7：最终验证

### Task 7.1：全功能回归测试

- [ ] **启动应用**: `npx electron .`
- [ ] **测试基本播放**: 添加文件夹 → 点击歌曲 → 播放/暂停/上一首/下一首
- [ ] **测试播放模式**: 切换列表循环/单曲循环/随机播放
- [ ] **测试歌词**: 播放有歌词的歌曲，确认歌词同步滚动
- [ ] **测试播放列表**: 专辑切换、搜索过滤、拖拽排序、右键删除、清空列表
- [ ] **测试可视化**: 确认频谱动画和波形进度条正常
- [ ] **测试窗口控制**: 最大化/还原、置顶、最小化、关闭
- [ ] **测试托盘**: 托盘右键菜单播放/暂停/退出
- [ ] **测试清空/重载**: 清空列表后重新添加

### Task 7.2：最终提交

- [ ] 确认所有更改无误后，提交代码

```bash
git add -A
git commit -m "refactor: 第1轮代码清理——移除死代码、合并重复实现、修复运行时bug
- 删除废弃的 cover.js、死 CSS、空转 top-waveform
- 归档已过时的测试/原型文件 (archive/)
- 提取 stripExtension/basename/showToast 等共享工具方法
- 统一文件扫描器、music-metadata 懒加载器
- 修复 dispose 双重释放、maximizeChange 双发、进度条被覆盖
- 统一 toast、song-title/artist、currentPlayingIndex 管理入口
- 移除未使用的 preload API"
```

---

## 影响范围总表

| 阶段 | Task | 修改文件数 | 删除文件数 | 风险等级 |
|------|------|-----------|-----------|---------|
| 1.1 | 移除 cover.js | 1 | 1 | 🟢 低 |
| 1.2 | 移除 top-waveform 空转 | 2 | 0 | 🟢 低 |
| 1.3 | 移除 CSS 死样式 | 1 | 0 | 🟢 低 |
| 1.4 | 归档废弃文件 | 0 | 4（移动） | 🟢 低 |
| 2.1 | 添加工具方法 | 1 | 0 | 🟢 低 |
| 2.2 | 替换扩展名剥离 | 3 | 0 | 🟢 低 |
| 2.3 | 替换 basename | 2 | 0 | 🟢 低 |
| 2.4 | 替换时间格式化 | 1 | 0 | 🟢 低 |
| 2.5 | 提取 Canvas DPR | 1 | 0 | 🟢 低 |
| 3.1 | 统一扫描器 | 2 | 0 | 🟡 中 |
| 3.2 | 共享 metadata 加载 | 3（+1新建） | 0 | 🟡 中 |
| 3.3 | 同步扩展名列表 | 2 | 0 | 🟢 低 |
| 4.1 | 修复 dispose 双重释放 | 2 | 0 | 🔴 关键 |
| 4.2 | 修复 maximizeChange 双发 | 2 | 0 | 🔴 关键 |
| 4.3 | 修复进度条覆盖 | 1 | 0 | 🟡 中 |
| 4.4 | 托盘通知渲染进程 | 1 | 0 | 🟡 中 |
| 5.1 | 统一 Toast 系统 | 1 | 0 | 🟡 中 |
| 5.2 | 统一 trackInfo | 2 | 0 | 🟡 中 |
| 5.3 | 统一 currentPlayingIndex | 4 | 0 | 🟡 中 |
| 6.1 | 清理未用 preload API | 2 | 0 | 🟡 中 |
| 7.1 | 回归测试 | 0 | 0 | - |
