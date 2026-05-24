const mm = require('music-metadata');

/**
 * 解析文件元数据
 * @param {string} filePath
 * @param {object} [options]
 * @returns {Promise<object>}
 */
async function parseFile(filePath, options) {
  return mm.parseFile(filePath, options);
}

module.exports = { parseFile };
