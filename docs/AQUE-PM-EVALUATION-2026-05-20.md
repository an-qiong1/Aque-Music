# AQUE Player 项目基础功能与 UI 评测报告

评测日期：2026-05-20  
角色视角：高级产品经理 / 桌面播放器产品验收  
项目类型：Electron + BASS 本地音乐播放器  

## 1. 结论

AQUE Player 已经具备本地播放器的基础闭环：窗口、文件导入、播放控制、播放列表、歌词、本地持久化、托盘、全局媒体键、构建打包。当前最大风险不是“能不能跑”，而是产品化稳定性、安全边界和资料库体验还不够成熟。

综合评级：**Beta 可用，但不建议直接作为正式版发布**。

核心原因：

1. 基础构建可以通过，但默认 `dist` 构建被旧产物锁定影响，发布流程不稳定。
2. 播放器核心存在暂停后拖动进度再播放可能回跳的状态缺陷。
3. 渲染层存在搜索高亮 XSS 风险；在 Electron 场景下影响高于普通网页。
4. UI 视觉已经有识别度，但缺少现代音乐播放器关键体验：封面、资料库、播放队列、音效/EQ、空状态引导、可访问性。
5. 与 MusicBee / AIMP 这类成熟本地播放器相比，当前更像“漂亮的单窗口播放工具”，还不是完整音乐管理器。

## 2. 本次测试覆盖

### 2.1 已执行检查

| 检查项 | 命令 / 方法 | 结果 |
|---|---|---|
| `package.json` 解析 | `node -e "JSON.parse(...)"` | 通过 |
| JS 语法检查 | `node --check` 扫描 `src/**/*.js` | 通过 |
| 依赖树 | `npm ls --depth=0` | 通过，无缺失依赖 |
| 默认构建 | `npm run build:dir` | 失败：`dist/win-unpacked/resources/app.asar` 被占用 |
| 临时目录构建 | `npx electron-builder build --win dir --config.directories.output=build-check` | 通过 |
| DOM ID 匹配 | 对 `index.html` 与 `renderer/js/*.js` 做脚本比对 | 未发现 JS 引用缺失 ID |
| UI 原型对比 | 对比 `archive/UI.html` 与 `src/renderer/index.html` | 当前版功能更工程化，但视觉层次与管理能力仍弱 |

### 2.2 未覆盖项

以下项目需要人工或自动化 GUI 环境补测：

- 真实音频播放：MP3 / FLAC / APE / DSD / MIDI。
- BASS WASAPI 独占模式与设备切换。
- 托盘菜单、全局媒体键在系统级场景下的行为。
- 大型曲库：1 万首以上扫描、搜索、播放列表渲染性能。
- NSIS 安装包安装、卸载、文件关联。

## 3. 基础功能验收

### 3.1 已具备功能

| 模块 | 当前状态 | 说明 |
|---|---|---|
| 无边框窗口 | 已实现 | `contextIsolation: true`、`nodeIntegration: false` 是正向点 |
| 播放控制 | 已实现 | 播放、暂停、上一首、下一首、停止、进度跳转 |
| BASS 音频引擎 | 已实现 | 支持多 DLL 插件，格式覆盖较广 |
| 文件导入 | 已实现 | 支持多文件、文件夹扫描、拖拽 |
| 播放列表 | 已实现 | 多专辑 tab、搜索、拖拽排序、持久化 |
| 歌词 | 已实现 | 标签歌词、外部 LRC、在线歌词 |
| 托盘与快捷键 | 已实现 | 系统托盘、媒体键、全局快捷键 |
| 播放统计 | 已实现 | 记录播放次数和历史 |
| 构建 | 可通过 | 默认输出目录被占用时会失败，需要流程优化 |

### 3.2 主要缺陷

#### P0 / 必须修复

1. **播放列表搜索高亮存在 XSS 风险**  
   - 位置：`src/renderer/js/playlist.js:104`
   - 问题：代码先读取曲名文本，再拼接到 `innerHTML`。如果本地文件名或元数据包含 HTML 片段，搜索命中时可能被当作 DOM 注入。
   - 影响：普通网页是 XSS；Electron 中 preload 暴露了文件、播放、标签读取能力，风险更高。
   - 建议：高亮用 `textContent` + 创建 `span` 节点，不拼接 HTML 字符串。

2. **Electron 安全边界不完整**  
   - 位置：`src/main/window.js:31`、`src/renderer/index.html:7`
   - 问题：`sandbox: false`；页面无 CSP；还从 Google Fonts 加载远程 CSS。
   - 正向点：`contextIsolation: true`、`nodeIntegration: false` 已开启。
   - 影响：一旦渲染层出现注入或远程资源被污染，攻击面扩大。
   - 建议：移除远程字体依赖，字体本地化；加入 CSP；启用 sandbox；所有 IPC 校验 sender 和参数。

3. **暂停后拖动进度再播放可能回跳**  
   - 位置：`src/main/audio/bass-engine.js:153`、`src/main/audio/bass-engine.js:201`
   - 问题：`play()` 每次都 seek 到 `_pausedPosition`，但 `seek(seconds)` 不更新 `_pausedPosition`。
   - 复现场景：播放 → 暂停 → 点击进度条到新位置 → 播放；预期从新位置继续，实际可能回到旧暂停点。
   - 建议：暂停状态下 seek 同步 `_pausedPosition`，或 `play()` 仅在明确恢复暂停点时回 seek。

#### P1 / 高优先级

4. **窗口关闭路径未释放 BASS 资源**  
   - 位置：`src/main/index.js:68`
   - 问题：`before-quit` 只注销快捷键和 watcher，没有调用 `audio.dispose()`；托盘“退出”路径有 dispose，但窗口/系统退出路径不一致。
   - 建议：`before-quit` 统一释放音频引擎、FFT timer、BASS DLL 资源。

5. **启动后会自动播放上次曲目**  
   - 位置：`src/renderer/js/app.js:170`
   - 问题：加载播放列表后直接 `playTrack(saved.currentPlayingIndex)`，会自动开始播放。
   - 影响：桌面播放器通常应恢复选中状态，不应无确认自动出声。
   - 建议：保存 `lastPlayingIndex` 与 `wasPlaying`，默认只恢复 UI，不自动播放。

6. **文件夹导入没有形成稳定资料库闭环**  
   - 位置：`src/renderer/js/playlist.js:257`、`src/renderer/js/app.js:179`
   - 问题：`_onAddFolder()` 只扫描并加入当前列表，没有持久化 folder 列表，也没有立即 `watchFolder(folderPath)`；`library:buildIndex` 未暴露到 preload/API/UI。
   - 影响：用户以为导入的是“资料库”，实际更像一次性批量加入播放列表。
   - 建议：把“文件夹库”和“播放列表”分离：folder source 持久化、增量索引、启动自动 watch。

7. **播放统计口径不准确**  
   - 位置：`src/renderer/js/player.js:92`
   - 问题：一调用 `playTrack()` 就记录播放次数，即使只播放 1 秒也算一次。
   - 建议：播放超过 30 秒或超过总时长 50% 后再计数。

#### P2 / 中优先级

8. **在线歌词请求体验不可控**  
   - 位置：`src/main/lyrics/provider.js`
   - 问题：顺序尝试网易云、QQ、酷狗，每个 5 秒超时，弱网场景一首歌可能阻塞较久；没有用户开关、缓存、取消机制。
   - 建议：并发竞速 + 本地缓存 + 用户设置“自动在线歌词”开关。

9. **拖拽排序样式清理选择器错误**  
   - 位置：`src/renderer/js/playlist.js:146`
   - 问题：清理 `.playlist-content-item`，实际列表项 class 是 `.playlist-item`。
   - 影响：当前 `_renderList()` 会重绘兜底，因此不是致命 bug，但属于维护隐患。

10. **可访问性不足**  
   - 问题：大量 9px/10px 文案、隐藏滚动条、按钮无 aria-label、键盘 focus 状态弱。
   - 影响：长时间使用和高 DPI 场景可读性差。

## 4. UI 设计评估

### 4.1 当前 UI 优点

- 视觉识别度明确：黑色背景 + 白色圆角播放卡片 + 绿色强调色，有记忆点。
- 单窗口聚焦：播放器核心操作集中在底部，适合小窗常驻。
- 歌词卡片位置合理：歌词区域是主内容，不是附属小组件。
- 播放列表以 overlay 呈现，避免常驻挤压播放器主体。
- 已把原型中的 CDN Tailwind / Phosphor 改成本地构建和本地图标，这是工程化改进。

### 4.2 当前 UI 问题

| 问题 | 影响 | 建议 |
|---|---|---|
| 缺少专辑封面 | 音乐播放器情绪价值不足 | 增加封面区域；无封面时生成渐变唱片/频谱占位 |
| 播放列表 overlay 完全遮挡主界面 | 用户边看歌词边管理队列困难 | 改为可收缩底部队列或右侧 drawer |
| 层级过少 | 顶部视觉器、歌词、控制条割裂 | 用“正在播放卡片 + 队列卡片 + 歌词卡片”统一容器体系 |
| 小字号过多 | 可读性和无障碍不足 | 正文至少 12px，关键操作 14px；按钮加 tooltip |
| 缺少空状态引导 | 初次打开不知道下一步 | 增加“拖入音乐 / 选择文件夹 / 导入播放列表”三入口 |
| 无主题系统 | 用户难以个性化 | 至少提供浅色、深色、专辑取色 3 种主题 |
| 无播放队列概念 | 只能列表循环，缺少“下一首播放” | 增加 Up Next、播放历史、插队播放 |

### 4.3 与 `archive/UI.html` 对比

当前 `src/renderer/index.html` 比 `archive/UI.html` 更适合作为产品代码：

- 当前版增加了真实窗口按钮 ID、文件夹导入、工程化 CSS/JS 拆分。
- 当前版去掉了原型中的 CDN Tailwind、CDN 图标和内联大段脚本。
- 当前版结构更短，维护性更好。

但原型里更强的“视觉展示感”被削弱了：

- 原型包含更多 canvas / waveform / lyric 相关视觉表达。
- 当前版更像工程落地版本，缺少封面、主题、皮肤、资料库入口这些产品化包装。

结论：**当前 HTML 不是没有优化空间；恰恰已经到达“功能能用，但需要产品化设计系统”的阶段。**

## 5. 竞品启发

参考来源：

- Electron 官方安全文档：https://www.electronjs.org/docs/latest/tutorial/security
- Electron Releases：https://releases.electronjs.org/
- MusicBee 官方站：https://www.getmusicbee.com/
- AIMP 官方功能页：https://aimp.ru/?do=features

来源要点：

- Electron 官方安全文档强调 Electron 应保持当前版本、启用 contextIsolation / sandbox、设置 CSP，并验证 IPC sender。
- MusicBee 官方站强调资料库管理、自动标签、WASAPI/ASIO、无缝播放、皮肤、设备同步。
- AIMP 官方功能页强调多格式播放、CUE、WASAPI Exclusive、智能播放列表、文件搜索、标签编辑、转换器、定时任务。

对 AQUE Player 的启发：

1. **不要只做播放器，要做轻量音乐管理器**  
   当前文件夹导入和播放列表混在一起。成熟播放器通常有“资料库 / 播放列表 / 当前队列”三层模型。

2. **音质功能需要产品化入口**  
   BASS 已是优势，但 UI 没有展示输出设备、独占模式、采样率、比特率、ReplayGain、EQ。

3. **本地文件管理是核心竞争点**  
   标签修正、封面补全、批量重命名、缺失文件定位，是本地播放器用户高频需求。

4. **皮肤和主题是播放器的情绪价值**  
   AQUE 目前有视觉调性，但缺少可切换主题和专辑取色。

## 6. 建议优化路线

### Phase 1：发布前硬化

目标：先把“基础可靠、不会出安全问题”做好。

- 修复播放列表搜索高亮 XSS。
- 移除远程 Google Fonts，字体本地化。
- 添加 CSP meta 或主进程 header。
- 开启 renderer sandbox，并最小化 preload 暴露 API。
- IPC 参数校验：路径、类型、sender URL。
- `before-quit` 统一 `audio.dispose()`。
- 修复暂停 seek 回跳。
- 构建前清理/检测 `dist` 占用，避免发布失败。

### Phase 2：音乐资料库闭环

目标：从“播放列表工具”升级为“本地音乐库”。

- 新增 Library Source：持久化用户导入的文件夹。
- 暴露并接入 `library:buildIndex`。
- 启动后自动 watch 已导入文件夹。
- 区分：资料库、播放列表、当前队列。
- 增加缺失文件检测和重新定位。
- 播放统计改为有效播放阈值。

### Phase 3：UI 产品化美化

目标：形成可发布的差异化界面。

- 增加专辑封面区域：优先读取内嵌封面，无封面生成渐变封面。
- 新增“现在播放 / 队列 / 资料库 / 歌词”四个视图层级。
- 播放列表从全屏 overlay 改为底部 sheet 或右侧 drawer。
- 加入主题系统：暗色、浅色、专辑色、OLED 黑。
- 增加音质信息条：格式、采样率、比特率、输出模式。
- 增加 EQ / 音效入口，先做 UI 占位也能提升专业感。
- 增加空状态引导和快捷键说明。

## 7. 推荐验收用例

### 播放链路

1. 导入单个 MP3，点击播放、暂停、恢复。
2. 播放中点击进度条跳转。
3. 暂停后点击进度条跳转，再恢复播放。
4. 播放结束后列表循环、单曲循环、随机播放分别验证。
5. 拖拽排序后验证当前播放索引不乱。

### 文件库

1. 导入文件夹，重启应用后文件仍存在。
2. 导入文件夹后新增音频文件，应用自动发现。
3. 删除正在播放的文件，播放器停止并更新 UI。
4. 移动文件后启动，提示缺失而不是静默失败。

### 歌词

1. 内嵌歌词优先。
2. 同名 `.lrc` 优先。
3. GBK / UTF-8 / UTF-16 LRC 都能读取。
4. 无歌词时显示“暂无歌词”，不要误判为纯音乐。
5. 在线歌词失败时不阻塞播放。

### 安全

1. 文件名包含 `<img src=x onerror=alert(1)>`，搜索时不执行。
2. 元数据 title/artist 包含 HTML，列表和标题只显示文本。
3. preload 暴露 API 不能被任意 iframe/新窗口滥用。
4. CSP 下页面仍能正常加载本地 CSS、JS、字体、图标。

## 8. 产品评分

| 维度 | 评分 | 说明 |
|---|---:|---|
| 基础播放能力 | 7/10 | 功能链路完整，但暂停 seek 和资源释放需修 |
| 音频格式覆盖 | 8/10 | BASS 插件覆盖好，缺少 UI 解释和设备配置 |
| 播放列表 | 6/10 | 可用，但队列、缺失文件、有效统计不足 |
| 资料库能力 | 4/10 | 有索引代码，但产品入口和持久化闭环不足 |
| 歌词体验 | 6/10 | 功能丰富，但在线歌词可控性不足 |
| UI 视觉 | 6/10 | 有辨识度，缺封面/主题/层级/无障碍 |
| 安全性 | 5/10 | 基础隔离有，但 CSP、sandbox、XSS、IPC 校验不足 |
| 发布稳定性 | 6/10 | 可构建，但默认 dist 被占用会失败 |

综合建议：先做 Phase 1，完成后可以作为公开测试版；Phase 2 + Phase 3 完成后再作为正式版。
