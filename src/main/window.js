const { BrowserWindow, app } = require('electron');
const path = require('path');
const fs = require('fs');

let win = null;
let isPinned = false;

function create() {
  let winState = { width: 440, height: 850 };
  try {
    const statePath = path.join(app.getPath('userData'), 'window-state.json');
    if (fs.existsSync(statePath)) {
      const saved = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      winState = { ...winState, ...saved };
    }
  } catch {}

  const iconPath = path.join(__dirname, '..', '..', 'assets', 'icons', 'app-icon.ico');

  win = new BrowserWindow({
    width: winState.width,
    height: winState.height,
    x: winState.x,
    y: winState.y,
    resizable: true,
    frame: false,
    transparent: false,
    backgroundColor: '#121212',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    minWidth: 420,
    minHeight: 700,
    show: false,
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  win.once('ready-to-show', () => win.show());

  win.webContents.on('console-message', (e, level, msg, line, sourceId) => {
    const tag = ['verbose','info','warning','error'][level] || 'log';
    console.log(`[RENDERER:${tag}] ${msg} (${sourceId || ''}:${line})`);
  });

  win.webContents.on('did-fail-load', (e, code, desc) => {
    console.error('RENDERER FAIL LOAD:', code, desc);
  });

  win.on('page-title-updated', (e, title) => {
    console.log('RENDERER TITLE:', title);
  });

  win.show();
  win.once('ready-to-show', () => {
    console.log('RENDERER ready-to-show');
  });

  const saveState = () => {
    if (win && !win.isDestroyed()) {
      const bounds = win.getBounds();
      try {
        fs.writeFileSync(
          path.join(app.getPath('userData'), 'window-state.json'),
          JSON.stringify({
            width: bounds.width, height: bounds.height,
            x: bounds.x, y: bounds.y,
          })
        );
      } catch {}
    }
  };
  win.on('resize', saveState);
  win.on('move', saveState);

  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  win.on('maximize', () => {
    if (win && !win.isDestroyed()) win.webContents.send('window:maximizeChange', true);
  });
  win.on('unmaximize', () => {
    if (win && !win.isDestroyed()) win.webContents.send('window:maximizeChange', false);
  });
}

function getWin() { return win; }

function togglePin() {
  isPinned = !isPinned;
  win?.setAlwaysOnTop(isPinned);
  return isPinned;
}

function toggleMaximize() {
  if (!win) return false;
  if (win.isMaximized()) {
    win.unmaximize();
    return false;
  }
  win.maximize();
  return true;
}

function setProgressBar(progress, state) {
  if (win && !win.isDestroyed()) {
    win.setProgressBar(progress, {
      mode: state === 'playing' ? 'normal' : 'paused',
    });
  }
}

module.exports = { create, getWin, togglePin, toggleMaximize, setProgressBar };
