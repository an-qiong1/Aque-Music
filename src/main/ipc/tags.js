const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');
const { parseFile } = require('../utils/audio-metadata.js');
const lyricsApi = require('../lyrics/provider.js');
const { trustedHandler, assertTrustedSender, assertFilePath } = require('../utils/ipc-utils.js');

let _currentLyricsSearchToken = 0;
let _pendingLyricsSearch = null;

function detectAndConvertEncoding(buffer, hint) {
  // When hint is 'chinese', try GBK-family first, then fall through to UTF-8
  const chineseEncodings = ['gbk', 'gb2312', 'gb18030', 'big5', 'utf-16le', 'utf-16be'];
  if (hint === 'chinese') {
    for (const enc of chineseEncodings) {
      try {
        const decoded = iconv.decode(buffer, enc);
        if (!decoded.includes('\ufffd')) {
          return decoded;
        }
      } catch (e) { continue; }
    }
    return buffer.toString('utf-8');
  }
  // Original path: try UTF-8 first
  const utf8Decoded = buffer.toString('utf-8');
  if (!utf8Decoded.includes('\ufffd')) {
    return utf8Decoded;
  }
  for (const enc of chineseEncodings) {
    try {
      const decoded = iconv.decode(buffer, enc);
      if (!decoded.includes('\ufffd')) {
        return decoded;
      }
    } catch (e) { continue; }
  }
  return utf8Decoded;
}

// 尝试从MP3文件中直接读取ID3标签中的歌词
function readLyricsFromMp3(filePath) {
  try {
    // 只读取文件开头部分，因为ID3v2标签总是在文件开始位置
    const fd = fs.openSync(filePath, 'r');
    const fileSize = fs.statSync(filePath).size;
    // 读取前1MB或文件大小（取较小值）- ID3v2标签通常<100KB，1MB足够覆盖绝大多数情况
    const readSize = Math.min(fileSize, 1024 * 1024);
    const buffer = Buffer.alloc(readSize);
    fs.readSync(fd, buffer, 0, readSize, 0);
    fs.closeSync(fd);
    // 查找ID3v2标签（通常在文件开头）
    // ID3v2标签格式: ID3 + 版本号 + 标志 + 大小(4字节同步安全整数)
    if (buffer.length > 10 && buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
      // 解析标签大小（同步安全整数）
      const size = (buffer[6] << 21) | (buffer[7] << 14) | (buffer[8] << 7) | buffer[9];
      
      // 遍历标签帧
      let offset = 10;
      while (offset + 10 < size + 10) {
        // 帧头: 4字节帧ID + 4字节大小 + 2字节标志
        const frameId = buffer.toString('ascii', offset, offset + 4);
        const frameSize = buffer.readUInt32BE(offset + 4);
        offset += 10;
        
        // 查找歌词帧（USLT - 非同步歌词，SYLT - 同步歌词）
        if (frameId === 'USLT' || frameId === 'SYLT') {
          if (offset + frameSize <= buffer.length) {
            // USLT帧结构: 语言编码(1) + 语言(3) + 描述(0-terminated) + 内容
            const encoding = buffer[offset];
            let contentOffset = offset + 4; // 跳过语言编码和语言
            // 跳过描述（直到遇到0）
            while (contentOffset < offset + frameSize && buffer[contentOffset] !== 0) {
              contentOffset++;
            }
            contentOffset++; // 跳过0
            
            const contentBuffer = buffer.slice(contentOffset, offset + frameSize);
            let lyrics = '';
            
            // 根据编码解析
            switch (encoding) {
              case 0: // ISO-8859-1
                // ISO-8859-1编码的歌词可能实际上是GBK编码
                lyrics = detectAndConvertEncoding(contentBuffer, 'chinese');
                break;
              case 1: // UTF-16
                lyrics = contentBuffer.toString('utf16le');
                break;
              case 2: // UTF-16BE
                lyrics = contentBuffer.toString('utf16be');
                break;
              case 3: // UTF-8
                lyrics = contentBuffer.toString('utf-8');
                break;
              default:
                lyrics = detectAndConvertEncoding(contentBuffer);
            }
            
            return lyrics;
          }
        }
        
        offset += frameSize;
      }
    }
  } catch (e) {
  }
  return null;
}

function register() {
  ipcMain.handle('tag:read', trustedHandler(async (event, filePath) => {
    assertFilePath(filePath, 'filePath');
    try {
      const meta = await parseFile(filePath);
      const tags = meta.common;
      
      let lyricsContent = null;
      
      if (tags.lyrics && Array.isArray(tags.lyrics) && tags.lyrics.length > 0) {
        const lyricTag = tags.lyrics[0];
        // music-metadata v7 可能返回字符串而非对象
        let text = null;
        if (typeof lyricTag === 'string') {
          text = lyricTag;
        } else if (lyricTag.syncText && Array.isArray(lyricTag.syncText) && lyricTag.syncText.length > 0) {
          const isMillis = lyricTag.timeStampFormat === 2;
          text = lyricTag.syncText.map(line => {
            if (line && line.text) {
              const timeSec = (line.timestamp || 0) / (isMillis ? 1000 : 1);
              const minutes = Math.floor(timeSec / 60);
              const secs = Math.floor(timeSec % 60);
              const millis = Math.floor((timeSec % 1) * 100);
              return `[${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(2, '0')}]${line.text}`;
            }
            return '';
          }).filter(line => line).join('\n');
        } else if (lyricTag.text && typeof lyricTag.text === 'string') {
          text = lyricTag.text;
        }
        if (text) {
          // 编码检测
          const alreadyHasCJK = /[\u4e00-\u9fa5]/.test(text);
          if (!alreadyHasCJK || text.includes('\ufffd')) {
            try {
              const isChinese = lyricTag.language === 'chi' || lyricTag.language === 'zho';
              const buffer = Buffer.from(text, 'latin1');
              const decoded = detectAndConvertEncoding(buffer, isChinese ? 'chinese' : undefined);
              if (/[\u4e00-\u9fa5]/.test(decoded) && decoded !== text) {
                text = decoded;
              }
            } catch (e) {
            }
          }
          lyricsContent = text;
        }
      }
      
      if (!lyricsContent && tags.lyric) {
        lyricsContent = typeof tags.lyric === 'string' ? tags.lyric : (Array.isArray(tags.lyric) ? tags.lyric[0] : null);
      }
      
      if (!lyricsContent && tags.unsynchronisedLyrics) {
        if (Array.isArray(tags.unsynchronisedLyrics) && tags.unsynchronisedLyrics.length > 0) {
          const lyricObj = tags.unsynchronisedLyrics[0];
          if (lyricObj && lyricObj.text) {
            lyricsContent = lyricObj.text;
          } else if (typeof lyricObj === 'string') {
            lyricsContent = lyricObj;
          }
        } else if (typeof tags.unsynchronisedLyrics === 'object' && tags.unsynchronisedLyrics.text) {
          lyricsContent = tags.unsynchronisedLyrics.text;
        }
      }
      
      // music-metadata v7 USLT 映射可能失败（'USLT' vs 'USLT:description'），直接从 native 标签中读取
      if (!lyricsContent && meta.native) {
        for (const tagType of Object.keys(meta.native)) {
          for (const frame of meta.native[tagType]) {
            if ((frame.id === 'USLT' || frame.id === 'SYLT') && frame.value) {
              let text = null;
              const val = frame.value;
              if (typeof val === 'string') {
                text = val;
              } else if (val.text && typeof val.text === 'string') {
                text = val.text;
              } else if (Array.isArray(val)) {
                text = val.map(v => typeof v === 'string' ? v : (v.text || '')).filter(Boolean).join('\n');
              }
              if (text) {
                lyricsContent = text;
                break;
              }
            }
          }
          if (lyricsContent) break;
        }
      }

      // 如果music-metadata没有找到歌词，尝试直接读取MP3文件
      if (!lyricsContent && filePath.toLowerCase().endsWith('.mp3')) {
        const directLyrics = readLyricsFromMp3(filePath);
        if (directLyrics) {
          lyricsContent = directLyrics;
        }
      }
      
      // 检测纯音乐：如果所有非空行都是元数据标签（无实际歌词），标记为纯音乐
      if (lyricsContent) {
        const metaLineRegex = /^\[.*?\]\s*(作词|作曲|编曲|制作人|录音|混音|母带|监制|OP|SP|出品|营销|统筹|吉他|bass|和音|发行|封面|混音室|录音室|艺人统筹|音乐总监|推广|原唱|原曲|Lyrics by|Composed by|Produced by|Recorded|Mixed|Mastered|Published)/i;
        const lines = lyricsContent.split('\n').map(l => l.trim()).filter(Boolean);
        const nonMetaLines = lines.filter(l => !metaLineRegex.test(l));
        const hasInstrumentalKeyword = /纯音乐|请欣赏|instrumental/i.test(lyricsContent);
        if (hasInstrumentalKeyword || (lines.length > 0 && nonMetaLines.length === 0)) {
          lyricsContent = null;
        }
      }
      
      return {
        title: tags.title || '', artist: tags.artist || '',
        album: tags.album || '', duration: meta.format.duration || 0,
        bitrate: meta.format.bitrate || null,
        sampleRate: meta.format.sampleRate || null,
        hasLyrics: !!lyricsContent,
        lyrics: lyricsContent,
      };
    } catch (e) {
      console.error('Error reading tags:', e);
      return null;
    }
  }));

  ipcMain.handle('lrc:read', trustedHandler(async (event, audioPath) => {
    assertFilePath(audioPath, 'audioPath');
    try {
      for (const ext of ['.lrc', '.LRC']) {
        const p = audioPath.replace(/\.[^.]+$/, '') + ext;
        if (!fs.existsSync(p)) continue;
        const buf = fs.readFileSync(p);
        const text = detectAndConvertEncoding(buf);
        return text;
      }
      return null;
    } catch (e) {
      console.error('[LRC Reader] Error reading LRC:', e.message);
      return null;
    }
  }));

  ipcMain.handle('tag:readCover', trustedHandler(async (event, filePath) => {
    assertFilePath(filePath, 'filePath');
    try {
      const meta = await parseFile(filePath, { skipCovers: false });
      const pics = meta.common.picture;
      if (pics && pics.length > 0) {
        const pic = pics[0];
        let dataBuffer;
        if (Buffer.isBuffer(pic.data)) {
          dataBuffer = pic.data;
        } else if (pic.data instanceof Uint8Array) {
          dataBuffer = Buffer.from(pic.data);
        } else if (Array.isArray(pic.data)) {
          dataBuffer = Buffer.from(pic.data);
        } else {
          console.error('Unsupported cover data type:', typeof pic.data);
          return null;
        }
        const result = 'data:' + pic.format + ';base64,' + dataBuffer.toString('base64');
        return result;
      }
    } catch (e) {
      console.error('Error reading cover:', e);
    }
    return null;
  }));

  ipcMain.handle('lyric:searchOnline', trustedHandler(async (event, title, artist) => {
    if (!title || !artist) return null;

    const searchToken = ++_currentLyricsSearchToken;

    const searchPromise = (async () => {
      try {
        let lrc = await lyricsApi.searchOnline(title, artist);
        if (searchToken !== _currentLyricsSearchToken) return null;
        if (!lrc) {
          lrc = await lyricsApi.searchOnlineFallback(title, artist);
          if (searchToken !== _currentLyricsSearchToken) return null;
        }
        return lrc || null;
      } catch {
        return null;
      }
    })();

    _pendingLyricsSearch = searchPromise;
    const result = await searchPromise;

    if (_pendingLyricsSearch === searchPromise) {
      _pendingLyricsSearch = null;
    }

    return result;
  }));
}

module.exports = { register };
