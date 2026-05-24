window.AQUE = window.AQUE || {};

AQUE.Visualizer = {
  _staticWaveform: Array.from({ length: 60 }, () => 0.2 + Math.random() * 0.6),
  _timeSeed: 0,
  _rafId: null,
  _lyricWaveformData: [],
  _isPlaying: false,
  _fftData: [],
  _lastProgress: -1,

  _setupCanvas: function (canvas) {
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
  },

  init() {
    this._setupWaveformClick();
    // 初始绘制一次静态波形
    this._drawStaticWave();
  },

  _setupWaveformClick() {
    const canvas = document.getElementById('podcast-waveform');
    if (!canvas) return;
    
    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const progress = x / rect.width;
      
      if (AQUE.State.currentDuration > 0 && progress >= 0 && progress <= 1) {
        const seekTime = progress * AQUE.State.currentDuration;
        AQUE.API.audioSeek(seekTime);
      }
    });
  },

  destroy() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  },

  setPlaying(isPlaying) {
    const wasPlaying = this._isPlaying;
    this._isPlaying = isPlaying;
    
    if (isPlaying && !wasPlaying && !this._rafId) {
      this._loop();
    }
  },

  updateFFTData(data) {
    this._fftData = data;
  },

  _loop() {
    if (this._isPlaying) {
      this._timeSeed += 0.05;
      this._drawStaticWave();
      this._animateDynamicVisualizer();
      this._rafId = requestAnimationFrame(() => this._loop());
    }
  },

  _drawStaticWave() {
    const canvas = document.getElementById('podcast-waveform');
    if (!canvas) return;

    const progress = window.AQUE_Progress || 0;
    if (progress === this._lastProgress) return;
    this._lastProgress = progress;

    const ctx = this._setupCanvas(canvas);

    const barW = 3;
    const gap = 3;
    const count = Math.floor(canvas.clientWidth / (barW + gap));

    for (let i = 0; i < count; i++) {
      const x = i * (barW + gap);
      const bh = (this._staticWaveform[i % this._staticWaveform.length] || 0.3) * canvas.clientHeight;
      const isPlayed = (i / count) <= progress;
      ctx.fillStyle = isPlayed ? 'rgba(29, 185, 84, 0.85)' : 'rgba(120, 120, 120, 0.5)';
      ctx.beginPath();
      ctx.roundRect(x, (canvas.clientHeight - bh) / 2, barW, bh, 2);
      ctx.fill();
    }
  },

  _animateDynamicVisualizer() {
    const canvas = document.getElementById('dynamic-visualizer');
    if (!canvas) return;
    const ctx = this._setupCanvas(canvas);

    const barWidth = 3;
    const barGap = 4;
    const totalBars = Math.floor(canvas.clientWidth / (barWidth + barGap));

    const pulseFactor = 0.85 + Math.sin(this._timeSeed * 1.5) * 0.15;
    ctx.fillStyle = 'rgba(29, 185, 84, 0.75)';

    if (this._fftData.length > 0) {
      for (let i = 0; i < totalBars; i++) {
        const fftIndex = Math.floor(i / totalBars * this._fftData.length * 0.4);
        const fftValue = this._fftData[fftIndex] || 0;
        const normalizedValue = Math.pow(fftValue / 255, 2) * 0.8 + Math.random() * 0.2;
        const bh = Math.max(0.1 * canvas.clientHeight, normalizedValue * canvas.clientHeight * pulseFactor);
        const x = i * (barWidth + barGap);

        ctx.globalAlpha = 0.4 + (bh / canvas.clientHeight) * 0.5;
        ctx.beginPath();
        ctx.roundRect(x, canvas.clientHeight - bh, barWidth, bh, 1.5);
        ctx.fill();
      }
    } else {
      for (let i = 0; i < totalBars; i++) {
        const noise = Math.sin(this._timeSeed + i * 0.2) * 0.35 + 0.5;
        const noise2 = Math.sin(this._timeSeed * 1.2 + i * 0.25) * 0.15;
        const combinedNoise = (noise + noise2) * pulseFactor;
        const bh = Math.max(0.1 * canvas.clientHeight, combinedNoise * canvas.clientHeight);
        const x = i * (barWidth + barGap);

        ctx.globalAlpha = 0.35 + (bh / canvas.clientHeight) * 0.5;
        ctx.beginPath();
        ctx.roundRect(x, canvas.clientHeight - bh, barWidth, bh, 1.5);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1.0;
  },


};
