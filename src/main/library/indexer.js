const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { scanFolders } = require('./scanner.js');
const { parseFile } = require('../utils/audio-metadata.js');

const INDEX_FILE = 'aque-library-index.json';

function getIndexPath() {
  return path.join(app.getPath('userData'), INDEX_FILE);
}

function readExistingIndex() {
  try {
    const p = getIndexPath();
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : null;
  } catch { return null; }
}

async function buildIndex(folderPaths, onProgress) {
  const existing = readExistingIndex();
  const fileModifiedMap = new Map();
  const existingTrackMap = new Map();
  if (existing && existing.tracks) {
    for (const t of existing.tracks) {
      fileModifiedMap.set(t.path, t.modified);
      existingTrackMap.set(t.path, t);
    }
  }

  const allFiles = scanFolders(folderPaths);
  const totalFiles = allFiles.length;
  const batchSize = 20;
  const tracks = [];
  const seenPaths = new Set();

  for (let i = 0; i < allFiles.length; i += batchSize) {
    const batch = allFiles.slice(i, i + batchSize);

    const batchResults = await Promise.all(batch.map(async (file) => {
      if (seenPaths.has(file.path)) {
        return null;
      }
      seenPaths.add(file.path);

      const prevModified = fileModifiedMap.get(file.path);

      if (prevModified !== undefined && prevModified === file.modified) {
        const existingTrack = existingTrackMap.get(file.path);
        if (existingTrack) {
          return existingTrack;
        }
      }

      try {
        const meta = await parseFile(file.path, { skipCovers: true, duration: false });
        return {
          ...file,
          title: meta.common.title || '',
          artist: meta.common.artist || '',
          album: meta.common.album || '',
          duration: meta.format.duration || 0,
          sampleRate: meta.format.sampleRate || null,
          bitrate: meta.format.bitrate || null,
        };
      } catch {
        return {
          ...file,
          title: file.name.replace(/\.[^/.]+$/, ''), // stripExtension inline (no renderer deps in main)
          artist: '',
          album: '',
          duration: 0,
        };
      }
    }));

    tracks.push(...batchResults.filter(Boolean));

    if (onProgress) {
      const processed = Math.min(i + batchSize, totalFiles);
      const lastFile = batch[batch.length - 1];
      onProgress({ current: processed, total: totalFiles, currentFile: lastFile.name, cached: false });
    }
  }

  const index = {
    version: 1,
    folders: folderPaths,
    builtAt: Date.now(),
    tracks,
  };

  fs.writeFileSync(getIndexPath(), JSON.stringify(index, null, 2));
  return index;
}

function getIndex() {
  return readExistingIndex();
}

function clearIndex() {
  try {
    if (fs.existsSync(getIndexPath())) fs.unlinkSync(getIndexPath());
    return true;
  } catch { return false; }
}

module.exports = { buildIndex, getIndex, clearIndex, getIndexPath };
