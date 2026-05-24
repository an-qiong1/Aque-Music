# AQUE Player 代码审查修复计划

## 发现汇总

- **Bug**: 6 个（含 1 严重 B1，2 中等 B2/B3）
- **重复代码**: 3 处 (D1-D3)
- **死代码**: K1-K3
- **性能问题**: 4 项 (P1-P4)
- **质量/可维护性**: 若干

## 执行阶段

### 阶段一：Bug 修复（高优先级）

| ID | 文件 | 改动描述 |
|----|------|----------|
| B1 | `src/main/window.js`, `src/preload/index.js`, `src/renderer/js/app.js` | 沙盒模式拖拽修复：移除 sandbox 或通过 preload 传递 File.path |
| B2 | `src/renderer/js/playlist.js:37-53` | `removeTrack()` 增加完整 UI 状态重置 |
| B3 | `src/renderer/js/player.js:253-261` | `_readTrackMetadata` 中补更新 `mediaSession.metadata` |
| B5 | `src/renderer/js/player.js:359-361` | 单曲循环 seek+play 改为 await seek 再 play |
| B6 | `src/main/audio/bass-engine.js:254-258` | getVolume 增加错误处理 |

### 阶段二：重复代码消除 & 死代码清理

| ID | 文件 | 改动描述 |
|----|------|----------|
| D1 | `src/main/ipc/files.js`, `stats.js`, `tags.js`, `ipc-utils.js` | assertFilePath 统一到 ipc-utils.js |
| D2 | `src/renderer/js/app.js`, `playlist.js` | 提取 `findTrackInAlbums()` 工具函数 |
| K1 | `src/renderer/js/api.js` | 移除 AQUE.State 未使用的事件系统 |
| K2 | `src/renderer/js/api.js`, `visualizer.js` | 移除未调用方法 |
| K3 | `src/main/ipc/tags.js` | 移除 readLyricsFromMp3 |
| - | `archive/` | 清理目录 |
| - | `assets/fonts/` | 清理空目录 |

### 阶段三：性能优化

| ID | 改动描述 |
|----|----------|
| P1 | 封面图 LRU 缓存 |
| P2 | 位置轮询 33ms→150ms |
| P3 | 搜索框 debounce 300ms |
| P4 | 元数据缓存复用 |

### 阶段四：工程稳固性

| ID | 改动描述 |
|----|----------|
| - | 添加 .gitignore |
| - | 清理构建产物目录 |
| - | track-name-parser 移除无用模式 |
| - | Visualizer 条形绘制去重 |
