const path = require('path');
const fs = require('fs');

const STATS_FILE = 'aque-playback-stats.json';
let saveTimeout = null;

function getStatsPath() {
  return path.join(require('electron').app.getPath('userData'), STATS_FILE);
}

function loadStats() {
  try {
    const p = getStatsPath();
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
  } catch (err) {
    console.error('[PlaybackStats] Error loading stats:', err.message);
  }
  return { tracks: {}, history: [] };
}

function saveStats(stats) {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    fs.writeFile(getStatsPath(), JSON.stringify(stats, null, 2), (err) => {
      if (err) console.error('[PlaybackStats] Error saving stats:', err.message);
    });
  }, 1000);
}

function recordPlayback(filePath) {
  const stats = loadStats();
  const now = Date.now();
  
  if (!stats.tracks[filePath]) {
    stats.tracks[filePath] = {
      path: filePath,
      playCount: 0,
      lastPlayed: 0,
      firstPlayed: now
    };
  }
  
  stats.tracks[filePath].playCount++;
  stats.tracks[filePath].lastPlayed = now;
  
  stats.history.unshift({
    path: filePath,
    timestamp: now
  });
  
  if (stats.history.length > 1000) {
    stats.history = stats.history.slice(0, 1000);
  }
  
  saveStats(stats);
  return stats;
}

function getMostPlayed(limit = 20) {
  const stats = loadStats();
  return Object.values(stats.tracks)
    .sort((a, b) => b.playCount - a.playCount)
    .slice(0, limit);
}

function getRecentlyPlayed(limit = 20) {
  const stats = loadStats();
  return stats.history.slice(0, limit);
}

function getStatsForTrack(filePath) {
  const stats = loadStats();
  return stats.tracks[filePath] || null;
}

function clearStats() {
  const stats = { tracks: {}, history: [] };
  saveStats(stats);
  return stats;
}

module.exports = {
  recordPlayback,
  getMostPlayed,
  getRecentlyPlayed,
  getStatsForTrack,
  clearStats,
  loadStats,
};
