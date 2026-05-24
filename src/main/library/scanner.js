const fs = require('fs');
const path = require('path');
const { isAudioFile } = require('../utils/audio-formats.js');

function scanFolder(folderPath) {
  const results = [];
  function walk(dir) {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.')) walk(full);
        } else if (entry.isFile() && isAudioFile(full)) {
          const stat = fs.statSync(full);
          results.push({ name: entry.name, path: full, size: stat.size, modified: stat.mtimeMs });
        }
      }
    } catch (err) {
      console.warn(`[Scanner] Error reading directory ${dir}:`, err.message);
    }
  }
  walk(folderPath);
  return results;
}

function scanFolders(folderPaths) {
  const allFiles = [];
  const seenPaths = new Set();
  
  for (const folder of folderPaths) {
    const files = scanFolder(folder);
    for (const file of files) {
      if (!seenPaths.has(file.path)) {
        seenPaths.add(file.path);
        allFiles.push(file);
      }
    }
  }
  return allFiles;
}

module.exports = { scanFolder, scanFolders };
