const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const NETBASE_URL = 'https://music.163.com';
const QQ_MUSIC_URL = 'https://c.y.qq.com';
const KUGOU_URL = 'https://krcs.kugou.com';
const TIMEOUT_MS = 5000;

const CACHE_FILE = 'aque-lyrics-cache.json';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function getCachePath() {
  return path.join(app.getPath('userData'), CACHE_FILE);
}

function makeCacheKey(songTitle, artistName) {
  return `${String(artistName || '').trim().toLowerCase()}::${String(songTitle || '').trim().toLowerCase()}`;
}

function readCache() {
  try {
    const p = getCachePath();
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : {};
  } catch {
    return {};
  }
}

function writeCache(cache) {
  try {
    fs.writeFileSync(getCachePath(), JSON.stringify(cache, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[lyrics-provider] Failed to write cache:', err.message);
  }
}

function withTimeout(promise, ms, signal) {
  const timeout = new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error('Request timeout')), ms);
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('Request cancelled'));
      });
    }
  });
  return Promise.race([promise, timeout]);
}

async function searchOnline(songTitle, artistName) {
  const cacheKey = makeCacheKey(songTitle, artistName);
  const cache = readCache();
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return cached.lyric || null;
  }

  const sources = [
    { name: 'NetEase', fn: searchNetEase },
    { name: 'QQMusic', fn: searchQQMusic },
    { name: 'KuGou', fn: searchKuGou }
  ];

  for (const { name, fn } of sources) {
    try {
      const lrc = await fn(songTitle, artistName);
      if (lrc) {
        cache[cacheKey] = { lyric: lrc, createdAt: Date.now() };
        writeCache(cache);
        return lrc;
      }
    } catch (err) {
      console.warn(`[lyrics-provider] ${name} failed:`, err.message);
    }
  }

  cache[cacheKey] = { lyric: null, createdAt: Date.now() };
  writeCache(cache);
  return null;
}

async function searchNetEase(songTitle, artistName) {
  try {
    const keywords = `${artistName} ${songTitle}`;
    const res = await withTimeout(axios.get(`${NETBASE_URL}/api/search/pc`, {
      params: { s: keywords, type: 1, offset: 0, limit: 5 },
      headers: {
        'Referer': 'https://music.163.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    }), TIMEOUT_MS);

    const data = res.data;
    if (!data || !data.result || !data.result.songs || data.result.songs.length === 0) {
      return null;
    }

    const songId = data.result.songs[0].id;

    const lrcRes = await withTimeout(axios.get(`${NETBASE_URL}/api/song/lyric`, {
      params: { id: songId, lv: 1, kv: 1, tv: -1 },
      headers: {
        'Referer': 'https://music.163.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    }), TIMEOUT_MS);

    const lrcData = lrcRes.data;
    if (lrcData && lrcData.lrc && lrcData.lrc.lyric) {
      return lrcData.lrc.lyric;
    }
    return null;
  } catch (err) {
    console.error('[lyrics-provider] NetEase API error:', err.message);
    return null;
  }
}

async function searchQQMusic(songTitle, artistName) {
  try {
    const keywords = `${artistName} ${songTitle}`;
    const res = await withTimeout(axios.get(`${QQ_MUSIC_URL}/soso/fcgi-bin/client_search_cp`, {
      params: { w: keywords, format: 'json', inCharset: 'utf-8', outCharset: 'utf-8' },
      headers: {
        'Referer': 'https://y.qq.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    }), TIMEOUT_MS);

    let data = res.data;
    if (typeof data === 'string' && data.startsWith('callback(')) {
      data = JSON.parse(data.slice(9, -1));
    }

    if (!data || !data.data || !data.data.song || !data.data.song.list || data.data.song.list.length === 0) {
      return null;
    }

    const songMid = data.data.song.list[0].mid;
    
    const lrcRes = await withTimeout(axios.get(`${QQ_MUSIC_URL}/lyric/fcgi-bin/fcg_query_lyric_new.fcg`, {
      params: { songmid: songMid, pcMidi: 1, g_tk: 5381 },
      headers: {
        'Referer': 'https://y.qq.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    }), TIMEOUT_MS);

    let lrcData = lrcRes.data;
    if (typeof lrcData === 'string' && lrcData.startsWith('MusicJsonCallback(')) {
      lrcData = JSON.parse(lrcData.slice(20, -1));
    }

    if (lrcData && lrcData.lyric) {
      return Buffer.from(lrcData.lyric, 'base64').toString('utf-8');
    }
    return null;
  } catch (err) {
    console.error('[lyrics-provider] QQ Music API error:', err.message);
    return null;
  }
}

async function searchKuGou(songTitle, artistName) {
  try {
    const keywords = `${artistName} ${songTitle}`;
    const res = await withTimeout(axios.get('https://mobileservice.kugou.com/api/v3/search/song', {
      params: { keyword: keywords, page: 1, pagesize: 5 },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    }), TIMEOUT_MS);

    const data = res.data;
    if (!data || !data.data || !data.data.info || data.data.info.length === 0) {
      return null;
    }

    const song = data.data.info[0];
    const hash = song.hash || song.id;
    
    const lrcRes = await withTimeout(axios.get(`${KUGOU_URL}/search`, {
      params: { hash, keyword: keywords, ver: 1, man: 'yes' },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    }), TIMEOUT_MS);

    const lrcData = lrcRes.data;
    if (lrcData && lrcData.candidates && lrcData.candidates.length > 0) {
      const candidate = lrcData.candidates[0];
      if (candidate.id && candidate.accesskey) {
        const downloadRes = await withTimeout(axios.get('https://krcs.kugou.com/download', {
          params: { id: candidate.id, accesskey: candidate.accesskey },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        }), TIMEOUT_MS);
        
        const downloadData = downloadRes.data;
        if (downloadData && downloadData.content) {
          return Buffer.from(downloadData.content, 'base64').toString('utf-8');
        }
      }
    }
    return null;
  } catch (err) {
    console.error('[lyrics-provider] KuGou API error:', err.message);
    return null;
  }
}

async function searchOnlineFallback(songTitle, artistName) {
  try {
    const url = `https://geci.me/api/lyric/${encodeURIComponent(artistName)}/${encodeURIComponent(songTitle)}`;
    const res = await withTimeout(axios.get(url), TIMEOUT_MS);
    if (res.data && res.data.result && res.data.result.length > 0) {
      return res.data.result[0].lrc || null;
    }
    return null;
  } catch (err) {
    console.warn('[lyrics-provider] Fallback API error:', err.message);
    return null;
  }
}

module.exports = { searchOnline, searchOnlineFallback };
