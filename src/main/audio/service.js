const path = require('path');
const BassEngine = require('./bass-engine.js');

class AudioService {
  constructor() {
    this._engine = null;
    this._volume = 0.8;
    this._positionCallbacks = new Set();
    this._stateCallbacks = new Set();
    this._posTimer = null;
    this._lastState = 'stopped';
    this._fftEnabled = false;
    this._fftInterval = null;
    this._fftCallbacks = new Set();
    this._trackingComplete = false;
    this._manualStopped = false;
  }

  init() {
    if (this._engine) return true;
    try {
      const fs = require('fs');
      const candidates = [
        path.join(__dirname, '..', '..', '..', 'BASS'),
        ...(() => {
          try { return [path.join(process.resourcesPath, 'BASS')]; }
          catch (_) { return []; }
        })(),
      ];
      let bassDir = candidates.find(d => fs.existsSync(path.join(d, 'bass.dll')));
      if (!bassDir) throw new Error('BASS directory not found in any candidate path');
      this._engine = new BassEngine(bassDir);
      this._engine.setVolume(this._volume);
      return true;
    } catch (err) {
      console.error('AudioService.init error:', err);
      return false;
    }
  }

  start() {
    if (this._posTimer) return;
    this._startPolling();
  }

  _startPolling() {
    this._posTimer = setInterval(() => {
      if (!this._engine || !this._engine.isLoaded) return;
      const pos = this._engine.position;
      const len = this._engine.length;
      const state = this._engine.state;
      this._lastState = state;

      if (state === 'stopped') {
        if (!this._trackingComplete && !this._manualStopped) {
          this._trackingComplete = true;
          for (const cb of this._stateCallbacks) cb('completed');
        }
        return;
      }

      if (state === 'paused') {
        this._trackingComplete = false;
        this._manualStopped = false;
        return;
      }

      if (state === 'playing') {
        this._trackingComplete = false;
        this._manualStopped = false;
      }

      for (const cb of this._positionCallbacks) {
        cb({ position: pos, length: len, state });
      }
    }, 100);

    if (this._fftEnabled) {
      this._startFFTPolling();
    }
  }

  _startFFTPolling() {
    if (this._fftInterval) return;
    this._fftInterval = setInterval(() => {
      if (!this._engine || !this._engine.isLoaded) return;
      const fft = this._engine.getFFTData();
      if (fft) {
        for (const cb of this._fftCallbacks) cb(fft);
      }
    }, 50);
  }

  _stopFFTPolling() {
    if (this._fftInterval) {
      clearInterval(this._fftInterval);
      this._fftInterval = null;
    }
  }

  enableFFT(enabled) {
    this._fftEnabled = enabled;
    if (enabled) {
      this._startFFTPolling();
    } else {
      this._stopFFTPolling();
    }
  }

  onPosition(cb) {
    this._positionCallbacks.add(cb);
    return () => this._positionCallbacks.delete(cb);
  }

  offPosition(cb) {
    this._positionCallbacks.delete(cb);
  }

  onState(cb) {
    this._stateCallbacks.add(cb);
    return () => this._stateCallbacks.delete(cb);
  }

  offState(cb) {
    this._stateCallbacks.delete(cb);
  }

  onFFT(cb) {
    this._fftCallbacks.add(cb);
    return () => this._fftCallbacks.delete(cb);
  }

  offFFT(cb) {
    this._fftCallbacks.delete(cb);
  }

  loadAndPlay(filePath) {
    if (!this._engine) this.init();
    try {
      this._engine.loadFile(filePath);
      this._engine.play();
      this._trackingComplete = false;
      return true;
    } catch (err) {
      console.error('loadAndPlay error:', err);
      return false;
    }
  }

  load(filePath) {
    if (!this._engine) this.init();
    try {
      this._engine.loadFile(filePath);
      this._trackingComplete = false;
      this._manualStopped = true;
      return true;
    } catch (err) {
      console.error('load error:', err);
      return false;
    }
  }

  play() {
    if (!this._engine) return false;
    return this._engine.play();
  }

  pause() {
    if (!this._engine) return false;
    return this._engine.pause();
  }

  playPause() {
    if (!this._engine || !this._engine.isLoaded) return false;
    if (this._engine.state === 'playing') {
      return this._engine.pause();
    }
    return this._engine.play();
  }

  setPlaybackRate(rate) {
    if (!this._engine) return false;
    return this._engine.setPlaybackRate(rate);
  }

  getPlaybackRate() {
    if (!this._engine) return 1.0;
    return this._engine.getPlaybackRate();
  }

  stop() {
    if (!this._engine) return false;
    this._manualStopped = true;
    return this._engine.stop();
  }

  seek(seconds) {
    if (!this._engine) return false;
    return this._engine.seek(seconds);
  }

  setVolume(vol) {
    this._volume = Math.max(0, Math.min(1, vol));
    if (this._engine) this._engine.setVolume(this._volume);
  }

  getVolume() {
    return this._volume;
  }

  getState() {
    if (!this._engine || !this._engine.isLoaded) {
      return { state: 'stopped', position: 0, length: 0 };
    }
    return {
      state: this._engine.state,
      position: this._engine.position,
      length: this._engine.length,
    };
  }

  isLoaded() {
    return this._engine && this._engine.isLoaded;
  }

  setWASAPIExclusive(enabled) {
    if (this._engine) this._engine.setWASAPIExclusive(enabled);
  }

  getWASAPIExclusive() {
    return this._engine ? this._engine.wasapiExclusive : false;
  }

  getFFTData() {
    if (!this._engine) return null;
    return this._engine.getFFTData();
  }

  dispose() {
    if (this._posTimer) {
      clearInterval(this._posTimer);
      this._posTimer = null;
    }
    this._stopFFTPolling();
    if (this._engine) this._engine.dispose();
    this._engine = null;
  }
}

module.exports = AudioService;
