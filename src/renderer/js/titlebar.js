window.AQUE = window.AQUE || {};

AQUE.Titlebar = {
  _clockTimer: null,

  init() {
    this._startClock();
    this._setupPinButton();
    this._setupMinCloseButtons();
  },

  _startClock() {
    const update = () => {
      const now = new Date();
      const h = now.getHours().toString().padStart(2, '0');
      const m = now.getMinutes().toString().padStart(2, '0');
      const el = document.getElementById('system-clock');
      if (el) el.innerText = `${h}:${m}`;
    };
    update();
    this._clockTimer = setInterval(update, 1000);
  },

  destroy() {
    if (this._clockTimer) {
      clearInterval(this._clockTimer);
      this._clockTimer = null;
    }
  },

  _setupPinButton() {
    const btn = document.getElementById('pin-btn');
    if (!btn) return;
    btn.onclick = async () => {
      let isPinned;
      if (AQUE.API.isElectron) {
        isPinned = await AQUE.API.togglePin();
      }
      AQUE.State.isPinned = isPinned;
      const icon = document.getElementById('pin-icon');
      if (isPinned) {
        icon.className = 'ph-fill ph-push-pin text-xs text-emerald-500';
        AQUE.Utils.showToast('窗口已置顶', 1200);
      } else {
        icon.className = 'ph ph-push-pin text-xs text-gray-500';
        AQUE.Utils.showToast('取消置顶', 1200);
      }
    };
  },

  _setupMinCloseButtons() {
    const minBtn = document.getElementById('min-btn');
    if (minBtn) {
      minBtn.onclick = () => {
        if (AQUE.API.isElectron) {
          window.electronAPI.hideWindow();
        }
      };
    }
    const closeBtn = document.getElementById('close-btn');
    if (closeBtn) {
      closeBtn.onclick = () => {
        if (AQUE.API.isElectron) AQUE.API.closeWindow();
      };
    }
  },
};
