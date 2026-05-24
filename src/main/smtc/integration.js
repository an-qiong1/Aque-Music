const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

let _tmpDir = null;

function getTmpDir() {
  if (!_tmpDir) {
    _tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aque-smtc-'));
  }
  return _tmpDir;
}

function escapeString(str) {
  if (!str) return '';
  return str.replace(/'/g, "''").replace(/`/g, '``');
}

function updateMediaInfo({ title, artist, album, coverBase64 }) {
  return new Promise((resolve) => {
    const tmpDir = getTmpDir();
    const scriptPath = path.join(tmpDir, `smtc_${Date.now()}.ps1`);

    const coverLine = coverBase64
      ? `$thumb = [System.Convert]::FromBase64String('${coverBase64.replace(/^data:image\/\w+;base64,/, '')}')`
      : '';

    const psScript = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Runtime

$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]

$sessionMgr = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync().GetAwaiter().GetResult()
$session = $sessionMgr.GetCurrentSession()

if ($session -eq $null) {
    Write-Output 'NO_SESSION'
    exit
}

$null = $session.TryEnterInteractiveSession()

$props = $session.TryGetMediaPropertiesAsync().GetAwaiter().GetResult()
if ($props -eq $null) {
    Write-Output 'NO_PROPS'
    exit
}

${coverLine}

$asyncInfo = $session.UpdateMediaPropertiesAsync(
    [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]::CreateFromTitleArtistAlbum(
        '${escapeString(title || 'Unknown')}',
        '${escapeString(artist || 'Unknown Artist')}',
        '${escapeString(album || '')}'
    )
)

try {
    $asyncInfo.GetAwaiter().GetResult()
    Write-Output 'OK'
} catch {
    Write-Output "ERROR: $($_.Exception.Message)"
}
`.trim();

    fs.writeFileSync(scriptPath, '\ufeff' + psScript, 'utf8');

    const ps = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath
    ], {
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';

    ps.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ps.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ps.on('close', () => {
      try {
        fs.unlinkSync(scriptPath);
      } catch {}
      const result = stdout.trim();
      if (result.includes('ERROR')) {
        console.error('[SMTC] Update failed:', result);
        resolve(false);
      } else {
        resolve(result === 'OK' || result === 'NO_SESSION' || result === 'NO_PROPS');
      }
    });

    ps.on('error', () => {
      try {
        fs.unlinkSync(scriptPath);
      } catch {}
      resolve(false);
    });
  });
}

function updatePlaybackState({ state, position, duration }) {
  return new Promise((resolve) => {
    const tmpDir = getTmpDir();
    const scriptPath = path.join(tmpDir, `smtc_state_${Date.now()}.ps1`);

    let playbackStatus = 'Unknown';
    if (state === 'playing') {
      playbackStatus = 'Playing';
    } else if (state === 'paused') {
      playbackStatus = 'Paused';
    } else if (state === 'stopped') {
      playbackStatus = 'Stopped';
    }

    const psScript = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Runtime

$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]

$sessionMgr = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync().GetAwaiter().GetResult()
$session = $sessionMgr.GetCurrentSession()

if ($session -eq $null) {
    Write-Output 'NO_SESSION'
    exit
}

$null = $session.TryEnterInteractiveSession()

$timeline = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionTimelineProperties]::CreateFromValues(
    [System.TimeSpan]::FromSeconds(${position || 0}),
    [System.TimeSpan]::FromSeconds(${duration || 0}),
    [System.TimeSpan]::Zero,
    [System.TimeSpan]::Zero
)

$null = $session.TryUpdateTimelineProperties($timeline)

$playbackInfo = $session.GetPlaybackInfo()
if ($playbackInfo) {
    $newInfo = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackInfo]::CreateFromPlaybackInfo($playbackInfo)
    $newInfo.PlaybackStatus = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus]::${playbackStatus}
    $null = $session.TryUpdatePlaybackInfo($newInfo)
}

Write-Output 'OK'
`.trim();

    fs.writeFileSync(scriptPath, '\ufeff' + psScript, 'utf8');

    const ps = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath
    ], {
      windowsHide: true
    });

    let stdout = '';

    ps.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ps.on('close', () => {
      try {
        fs.unlinkSync(scriptPath);
      } catch {}
      resolve(stdout.trim() === 'OK');
    });

    ps.on('error', () => {
      try {
        fs.unlinkSync(scriptPath);
      } catch {}
      resolve(false);
    });
  });
}

function cleanup() {
  if (_tmpDir && fs.existsSync(_tmpDir)) {
    try {
      fs.rmSync(_tmpDir, { recursive: true, force: true });
    } catch {}
    _tmpDir = null;
  }
}

module.exports = {
  updateMediaInfo,
  updatePlaybackState,
  cleanup
};
