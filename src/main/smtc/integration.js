/**
 * SMTC (System Media Transport Controls) 集成
 * 使用 xosms 原生模块替代 PowerShell 脚本，提供更好的性能
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let MediaPlayer = null;
let MediaPlayerPlaybackStatus = null;
let MediaPlayerThumbnail = null;
let MediaPlayerThumbnailType = null;
let MediaPlayerMediaType = null;

// 尝试加载 xosms 模块
try {
  const xosms = require('xosms');
  MediaPlayer = xosms.MediaPlayer;
  MediaPlayerPlaybackStatus = xosms.MediaPlayerPlaybackStatus;
  MediaPlayerThumbnail = xosms.MediaPlayerThumbnail;
  MediaPlayerThumbnailType = xosms.MediaPlayerThumbnailType;
  MediaPlayerMediaType = xosms.MediaPlayerMediaType;
} catch (err) {
  console.warn('[SMTC] xosms module not available:', err.message);
}

let _player = null;
let _isActivated = false;
let _onPlayCallback = null;
let _onPauseCallback = null;
let _onNextCallback = null;
let _onPreviousCallback = null;

/**
 * 初始化 SMTC 播放器
 * @param {Object} callbacks - 回调函数集合
 * @param {Function} callbacks.onPlay - 播放按钮回调
 * @param {Function} callbacks.onPause - 暂停按钮回调
 * @param {Function} callbacks.onNext - 下一曲回调
 * @param {Function} callbacks.onPrevious - 上一曲回调
 * @returns {boolean} 是否初始化成功
 */
function init(callbacks = {}) {
  if (!MediaPlayer) {
    console.warn('[SMTC] xosms not available, SMTC disabled');
    return false;
  }

  try {
    _player = new MediaPlayer('aque-music', 'AQUE Player');
    
    // 保存回调
    _onPlayCallback = callbacks.onPlay || null;
    _onPauseCallback = callbacks.onPause || null;
    _onNextCallback = callbacks.onNext || null;
    _onPreviousCallback = callbacks.onPrevious || null;

    // 启用控制按钮
    _player.playButtonEnabled = true;
    _player.pauseButtonEnabled = true;
    _player.nextButtonEnabled = true;
    _player.previousButtonEnabled = true;

    // 监听系统按钮事件
    _player.on('buttonpressed', (err, button) => {
      if (err) {
        console.error('[SMTC] Button press error:', err);
        return;
      }

      switch (button) {
        case 'play':
          if (_onPlayCallback) _onPlayCallback();
          break;
        case 'pause':
          if (_onPauseCallback) _onPauseCallback();
          break;
        case 'next':
          if (_onNextCallback) _onNextCallback();
          break;
        case 'previous':
          if (_onPreviousCallback) _onPreviousCallback();
          break;
      }
    });

    console.log('[SMTC] Initialized successfully');
    return true;
  } catch (err) {
    console.error('[SMTC] Init failed:', err);
    _player = null;
    return false;
  }
}

/**
 * 更新媒体信息
 * @param {Object} info - 媒体信息
 * @param {string} info.title - 歌曲标题
 * @param {string} info.artist - 艺术家
 * @param {string} info.album - 专辑名称
 * @param {string} info.coverBase64 - 封面图片的 Base64 编码（可选）
 * @returns {Promise<boolean>} 是否更新成功
 */
async function updateMediaInfo({ title, artist, album, coverBase64 }) {
  if (!_player) {
    return false;
  }

  try {
    // 设置媒体类型（必须在设置元数据之前）
    if (MediaPlayerMediaType) {
      _player.mediaType = MediaPlayerMediaType.Music;
    }
    
    // 设置元数据
    _player.title = title || 'Unknown';
    _player.artist = artist || 'Unknown Artist';
    _player.albumTitle = album || '';

    // 设置封面
    if (coverBase64 && MediaPlayerThumbnail && MediaPlayerThumbnailType) {
      try {
        // xosms 0.6.2: create() 是异步工厂方法
        // 对于 data URI，使用 Uri 类型
        const thumbnail = await MediaPlayerThumbnail.create(
          MediaPlayerThumbnailType.Uri,
          coverBase64
        );
        _player.setThumbnail(thumbnail);
      } catch (thumbErr) {
        console.warn('[SMTC] Thumbnail set failed:', thumbErr.message);
      }
    }

    // 推送更新到系统
    _player.update();

    // 激活 SMTC（如果尚未激活）
    if (!_isActivated) {
      _player.activate();
      _isActivated = true;
    }

    return true;
  } catch (err) {
    console.error('[SMTC] Update media info failed:', err);
    return false;
  }
}

/**
 * 更新播放状态
 * @param {Object} stateInfo - 状态信息
 * @param {string} stateInfo.state - 播放状态 ('playing', 'paused', 'stopped')
 * @param {number} stateInfo.position - 当前位置（秒）
 * @param {number} stateInfo.duration - 总时长（秒）
 * @returns {boolean} 是否更新成功
 */
function updatePlaybackState({ state, position, duration }) {
  if (!_player) {
    return false;
  }

  try {
    // 设置播放状态
    switch (state) {
      case 'playing':
        _player.playbackStatus = MediaPlayerPlaybackStatus.Playing;
        break;
      case 'paused':
        _player.playbackStatus = MediaPlayerPlaybackStatus.Paused;
        break;
      case 'stopped':
        _player.playbackStatus = MediaPlayerPlaybackStatus.Stopped;
        break;
      default:
        _player.playbackStatus = MediaPlayerPlaybackStatus.Unknown;
    }

    // 更新进度条（xosms 要求每次位置变化时调用）
    if (typeof position === 'number' && typeof duration === 'number' && duration > 0) {
      _player.setTimeline(duration, position);
    }

    return true;
  } catch (err) {
    console.error('[SMTC] Update playback state failed:', err);
    return false;
  }
}

/**
 * 更新回调函数
 * @param {Object} callbacks - 回调函数集合
 */
function updateCallbacks(callbacks) {
  if (callbacks.onPlay !== undefined) _onPlayCallback = callbacks.onPlay;
  if (callbacks.onPause !== undefined) _onPauseCallback = callbacks.onPause;
  if (callbacks.onNext !== undefined) _onNextCallback = callbacks.onNext;
  if (callbacks.onPrevious !== undefined) _onPreviousCallback = callbacks.onPrevious;
}

/**
 * 清理资源
 */
function cleanup() {
  if (_player) {
    try {
      // xosms 不需要显式停用，垃圾回收会处理
      _player = null;
      _isActivated = false;
      _onPlayCallback = null;
      _onPauseCallback = null;
      _onNextCallback = null;
      _onPreviousCallback = null;
      console.log('[SMTC] Cleaned up');
    } catch (err) {
      console.error('[SMTC] Cleanup error:', err);
    }
  }
}

/**
 * 检查 SMTC 是否可用
 * @returns {boolean}
 */
function isAvailable() {
  return !!MediaPlayer;
}

module.exports = {
  init,
  updateMediaInfo,
  updatePlaybackState,
  updateCallbacks,
  cleanup,
  isAvailable
};
