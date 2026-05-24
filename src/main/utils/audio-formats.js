const path = require('path');

const AUDIO_EXTS = new Set([
  '.mp3','.mp2','.mp1','.ogg','.wav','.wave',
  '.aif','.aiff','.aifc','.asf','.wma',
  '.aac','.adts','.m4a','.ac3','.amr','.3ga',
  '.flac','.mpc','.mid','.midi',
  '.wv','.wvc','.opus','.dsf','.dff','.ape',
]);

function isAudioFile(filePath) {
  return AUDIO_EXTS.has(path.extname(filePath).toLowerCase());
}

const AUDIO_EXTS_ARRAY = Array.from(AUDIO_EXTS).map(ext => ext.slice(1));

module.exports = { isAudioFile, AUDIO_EXTS, AUDIO_EXTS_ARRAY };
