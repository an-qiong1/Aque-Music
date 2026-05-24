const koffi = require('koffi');
const path = require('path');
const fs = require('fs');

const voidPtr = koffi.pointer('void');

const BASS_DEVICE_REINIT = 0x8000;
const BASS_UNICODE = 0x80000000;
const BASS_SAMPLE_FLOAT = 256;
const BASS_ASYNCFILE = 0x4000;
const BASS_STREAM_DECODE = 0x200000;
const BASS_SAMPLE_LOOP = 4;
const BASS_POS_BYTE = 0;
const BASS_ACTIVE_STOPPED = 0;
const BASS_ACTIVE_PLAYING = 1;
const BASS_ACTIVE_PAUSED = 2;
const BASS_ACTIVE_STALLED = 5;
const BASS_ATTRIB_VOLDSP = 0x10005;
const BASS_DATA_FFT2048 = 0x80000003;

class BassEngine {
  constructor(bassDir) {
    this.bassDir = bassDir || this._resolveBassDir();
    this._stream = 0;
    this._path = null;
    this._wasapiExclusive = false;
    this._pausedPosition = 0;
    this._playbackRate = 1.0;
    this._fftBuffer = koffi.alloc('float', 1024);
    this._init();
  }

  _resolveBassDir() {
    try {
      const p = path.join(process.resourcesPath, 'BASS', 'bass.dll');
      if (fs.existsSync(p)) return path.join(process.resourcesPath, 'BASS');
    } catch (err) {
      console.warn('BassEngine: resourcesPath not accessible:', err.message);
    }
    return path.join(__dirname, '..', '..', '..', 'BASS');
  }

  _loadLib(name) {
    const fullPath = path.join(this.bassDir, name);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`BASS DLL not found: ${fullPath}`);
    }
    const lib = koffi.load(fullPath);

    if (name === 'bass.dll') {
      this.BASS_Init = lib.func('BASS_Init', 'bool', ['uint32', 'uint32', 'uint32', voidPtr, voidPtr]);
      this.BASS_Free = lib.func('BASS_Free', 'bool', []);
      this.BASS_Start = lib.func('BASS_Start', 'bool', []);
      this.BASS_ErrorGetCode = lib.func('BASS_ErrorGetCode', 'int', []);
      this.BASS_StreamCreateFile = lib.func('BASS_StreamCreateFile', 'uint32', ['bool', 'str16', 'uint64', 'uint64', 'uint32']);
      this.BASS_StreamFree = lib.func('BASS_StreamFree', 'bool', ['uint32']);
      this.BASS_ChannelPlay = lib.func('BASS_ChannelPlay', 'bool', ['uint32', 'bool']);
      this.BASS_ChannelPause = lib.func('BASS_ChannelPause', 'bool', ['uint32']);
      this.BASS_ChannelStop = lib.func('BASS_ChannelStop', 'bool', ['uint32']);
      this.BASS_ChannelSetPosition = lib.func('BASS_ChannelSetPosition', 'bool', ['uint32', 'uint64', 'uint32']);
      this.BASS_ChannelGetPosition = lib.func('BASS_ChannelGetPosition', 'uint64', ['uint32', 'uint32']);
      this.BASS_ChannelGetLength = lib.func('BASS_ChannelGetLength', 'uint64', ['uint32', 'uint32']);
      this.BASS_ChannelBytes2Seconds = lib.func('BASS_ChannelBytes2Seconds', 'double', ['uint32', 'uint64']);
      this.BASS_ChannelSeconds2Bytes = lib.func('BASS_ChannelSeconds2Bytes', 'uint64', ['uint32', 'double']);
      this.BASS_ChannelIsActive = lib.func('BASS_ChannelIsActive', 'int', ['uint32']);
      this.BASS_ChannelSetAttribute = lib.func('BASS_ChannelSetAttribute', 'bool', ['uint32', 'uint32', 'float']);
      this.BASS_ChannelGetAttribute = lib.func('BASS_ChannelGetAttribute', 'bool', ['uint32', 'uint32', koffi.pointer('float')]);
      this.BASS_ChannelGetData = lib.func('BASS_ChannelGetData', 'uint32', ['uint32', voidPtr, 'uint32']);
      this.BASS_PluginLoad = lib.func('BASS_PluginLoad', 'uint32', ['string', 'uint32']);
    }

    if (name === 'basswasapi.dll') {
      this.BASS_WASAPI_Init = lib.func('BASS_WASAPI_Init', 'bool', ['int', 'uint32', 'uint32', 'uint32', 'float', 'uint32', voidPtr, voidPtr]);
      this.BASS_WASAPI_Free = lib.func('BASS_WASAPI_Free', 'bool', []);
      this.BASS_WASAPI_Start = lib.func('BASS_WASAPI_Start', 'bool', []);
      this.BASS_WASAPI_Stop = lib.func('BASS_WASAPI_Stop', 'bool', ['bool']);
      this.BASS_WASAPI_IsStarted = lib.func('BASS_WASAPI_IsStarted', 'bool', []);
    }

    return lib;
  }

  _init() {
    this._bassLib = this._loadLib('bass.dll');
    this._wasapiLib = this._loadLib('basswasapi.dll');

    this._loadPlugins();

    return this._initWithFallback();
  }

  _loadPlugins() {
    const plugins = [
      { name: 'bassflac.dll', required: false },
      { name: 'bassape.dll', required: false },
      { name: 'bassopus.dll', required: false },
      { name: 'basswv.dll', required: false },
      { name: 'bassdsd.dll', required: false },
      { name: 'bassmidi.dll', required: false },
    ];

    for (const plugin of plugins) {
      const pluginPath = path.join(this.bassDir, plugin.name);
      if (!fs.existsSync(pluginPath)) {
        continue;
      }

      const handle = this.BASS_PluginLoad(pluginPath, 0);
      if (!handle) {
        const err = this.BASS_ErrorGetCode();
        console.warn(`BassEngine: plugin ${plugin.name} not supported (error: ${err})`);
      }
    }
  }

  _initWithFallback() {
    const initOptions = [
      { device: -1, flags: BASS_DEVICE_REINIT, desc: 'default device (reinit)' },
      { device: -1, flags: 0, desc: 'default device' },
      { device: 0, flags: 0, desc: 'primary device' },
    ];

    for (let attempt = 0; attempt < initOptions.length; attempt++) {
      const opts = initOptions[attempt];
      const result = this.BASS_Init(opts.device, 48000, opts.flags, null, null);

      if (result) {
        if (attempt > 0) {
          console.warn(`BassEngine: BASS_Init succeeded with fallback: ${opts.desc}`);
        }
        return true;
      }

      const err = this.BASS_ErrorGetCode();
      console.warn(`BassEngine: BASS_Init attempt ${attempt + 1} failed (${opts.desc}): error ${err}`);

      if (err === 1) {
        continue;
      }
    }

    throw new Error(`BASS_Init failed after ${initOptions.length} attempts`);
  }

  get isLoaded() { return this._stream !== 0; }
  get streamHandle() { return this._stream; }
  get filePath() { return this._path; }

  get length() {
    if (!this._stream) return 1;
    const bytes = this.BASS_ChannelGetLength(this._stream, BASS_POS_BYTE);
    return this.BASS_ChannelBytes2Seconds(this._stream, bytes);
  }

  get position() {
    if (!this._stream) return 0;
    const bytes = this.BASS_ChannelGetPosition(this._stream, BASS_POS_BYTE);
    return this.BASS_ChannelBytes2Seconds(this._stream, bytes);
  }

  get state() {
    if (!this._stream) return 'stopped';
    const s = this.BASS_ChannelIsActive(this._stream);
    if (this._wasapiExclusive && s === BASS_ACTIVE_PLAYING) {
      return this.BASS_WASAPI_IsStarted() ? 'playing' : 'paused';
    }
    switch (s) {
      case BASS_ACTIVE_PLAYING: return 'playing';
      case BASS_ACTIVE_PAUSED: return 'paused';
      case BASS_ACTIVE_STOPPED: return 'stopped';
      case BASS_ACTIVE_STALLED: return 'stalled';
      default: return 'unknown';
    }
  }

  loadFile(filePath) {
    this._freeStream();
    this._pausedPosition = 0;
    const flags = BASS_UNICODE | BASS_SAMPLE_FLOAT | BASS_ASYNCFILE;
    const handle = this.BASS_StreamCreateFile(false, filePath, 0, 0, flags);
    if (!handle) {
      const err = this.BASS_ErrorGetCode();
      throw new Error(`BASS_StreamCreateFile failed for "${filePath}". Error: ${err}`);
    }
    this._stream = handle;
    this._path = filePath;
    return true;
  }

  play() {
    if (!this._stream) return false;
    const resumePos = this._pausedPosition;
    if (this._wasapiExclusive) {
      this.seek(resumePos);
      this.BASS_WASAPI_Start();
    } else {
      this.seek(resumePos);
      this.BASS_ChannelPlay(this._stream, false);
      if (this.position !== resumePos) {
        this.seek(resumePos);
      }
    }
    return true;
  }

  pause() {
    if (!this._stream) return false;
    this._pausedPosition = this.position;
    if (this._wasapiExclusive) {
      this.BASS_WASAPI_Stop(false);
    } else {
      this.BASS_ChannelPause(this._stream);
    }
    return true;
  }

  stop() {
    if (!this._stream) return false;
    this._pausedPosition = 0;
    if (this._wasapiExclusive) {
      this.BASS_WASAPI_Stop(false);
    } else {
      this.BASS_ChannelStop(this._stream);
    }
    return true;
  }

  setPlaybackRate(rate) {
    if (!this._stream || rate < 0.5 || rate > 2.0) return false;
    this._playbackRate = rate;
    const bassAttr = 0x1000C;
    return this.BASS_ChannelSetAttribute(this._stream, bassAttr, rate);
  }

  getPlaybackRate() {
    return this._playbackRate;
  }

  seek(seconds) {
    if (!this._stream) return false;
    const targetSeconds = Math.max(0, seconds);
    const bytes = this.BASS_ChannelSeconds2Bytes(this._stream, targetSeconds);
    const ok = this.BASS_ChannelSetPosition(this._stream, bytes, BASS_POS_BYTE);
    if (ok && this.state === 'paused') {
      this._pausedPosition = targetSeconds;
    }
    return ok;
  }

  setVolume(vol) {
    if (!this._stream) return false;
    return this.BASS_ChannelSetAttribute(this._stream, BASS_ATTRIB_VOLDSP, Math.max(0, Math.min(1, vol)));
  }

  getVolume() {
    if (!this._stream) return 0;
    const buf = koffi.alloc('float', 1);
    const ok = this.BASS_ChannelGetAttribute(this._stream, BASS_ATTRIB_VOLDSP, buf);
    return ok ? buf.value : 0;
  }

  setWASAPIExclusive(enabled) {
    this._wasapiExclusive = enabled;
  }

  get wasapiExclusive() { return this._wasapiExclusive; }

  getFFTData() {
    if (!this._stream || this.state !== 'playing') return null;
    const buf = this._fftBuffer;
    const result = this.BASS_ChannelGetData(this._stream, buf, BASS_DATA_FFT2048);
    if (result === 0xFFFFFFFF) return null;
    const arr = new Float32Array(256);
    for (let i = 0; i < 256; i++) arr[i] = buf.at(i);
    return arr;
  }

  _freeStream() {
    if (this._stream) {
      if (this._wasapiExclusive) this.BASS_WASAPI_Free();
      this.BASS_StreamFree(this._stream);
      this._stream = 0;
      this._path = null;
    }
  }

  dispose() {
    this._freeStream();
    this._fftBuffer = null;
    if (this.BASS_Free) this.BASS_Free();
  }
}

module.exports = BassEngine;
