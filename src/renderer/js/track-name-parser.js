AQUE.TrackNameParser = {
  SONG_PATTERNS: [
    /\(Live\)/,
    /\(Remix\)/i,
    /\(Acoustic\)/i,
    /\(Demo\)/i,
    /\(Cover\)/i,
    /\(Instrumental\)/i,
    /\(Radio Edit\)/i,
    /\(Extended Version\)/i,
    /-\s*\d+$/,
    /\(.*\)/,
  ],

  ARTIST_PATTERNS: [
    /乐队$|组合$|乐团$|工作室$/,
    /^[A-Z][a-z]+[A-Z][a-z]+$/,
    /^[A-Z][a-z]+[A-Z][a-z]+[A-Za-z]+$/,
    /^[A-Za-z]+[\s_-][A-Za-z]+$/,
    /^[A-Za-z]+[\s_-][A-Za-z]+[\s_-][A-Za-z]+$/,
    /feat\./i,
    /&|and/i,
  ],

  COMMON_SONG_WORDS: new Set([
    'Love', 'You', 'Me', 'My', 'Your', 'The', 'A', 'An', 'I', 'We', 'He', 'She', 'It', 'They', 'This', 'That', 'These', 'Those'
  ]),

  COMMON_CHINESE_SONGS: [
    '爱', '情', '心', '梦', '夜', '日', '月', '星', '风', '雨', '雪', '花', '海', '天', '地', '山', '水'
  ],

  parse(fullName) {
    const parts = fullName.split(/\s*[-–]\s*/);

    if (parts.length <= 1) {
      return { title: fullName, artist: null, confidence: 0 };
    }

    const part1 = parts[0].trim();
    const part2 = parts[1].trim();

    if (this._isLikelyArtist(part2) && !this._isLikelyArtist(part1)) {
      return { title: part1, artist: part2, confidence: 0.7 };
    }

    if (this._isLikelyArtist(part1) && !this._isLikelyArtist(part2)) {
      return { title: part2, artist: part1, confidence: 0.7 };
    }

    const result = this._compareAsArtist(part1, part2);
    return { title: result.title, artist: result.artist, confidence: 0.5 };
  },

  _isLikelyArtist(str) {
    if (!str) return false;

    for (const pattern of this.SONG_PATTERNS) {
      if (pattern.test(str)) return false;
    }

    for (const pattern of this.ARTIST_PATTERNS) {
      if (pattern.test(str)) return true;
    }

    const hasChinese = /[\u4e00-\u9fa5]/.test(str);
    const hasEnglish = /[A-Za-z]/.test(str);
    const isAllEnglish = /^[A-Za-z\s]+$/.test(str);

    if (isAllEnglish && str.length >= 4 && str.length <= 15 && !this.COMMON_SONG_WORDS.has(str)) {
      return true;
    }

    if (hasChinese && hasEnglish) return true;

    if (/^[\u4e00-\u9fa5]{1,3}$/.test(str) && !this.COMMON_CHINESE_SONGS.includes(str)) {
      return true;
    }

    return false;
  },

  _compareAsArtist(part1, part2) {
    const score1 = this._scoreAsArtist(part1);
    const score2 = this._scoreAsArtist(part2);

    if (score2 > score1) {
      return { title: part1, artist: part2 };
    } else if (score1 > score2) {
      return { title: part2, artist: part1 };
    }

    return { title: part1, artist: part2 };
  },

  _scoreAsArtist(str) {
    if (!str) return 0;
    let score = 0;

    if (/^[A-Za-z\s]+$/.test(str)) score += 3;
    if (/^[A-Z\s]+$/.test(str)) score -= 2;
    if (/^[A-Z][a-z]+[A-Z]/.test(str)) score += 2;
    if (/^[A-Za-z]+\s+[A-Za-z]+$/.test(str)) score += 2;
    if (/[\u4e00-\u9fa5]/.test(str) && /[A-Za-z]/.test(str)) score += 3;
    if (str.length >= 3 && str.length <= 15) score += 1;
    if (/乐队$|组合$|乐团$|feat\.|&/.test(str)) score += 5;
    if (/\(Live\)|\(Remix\)|\(Acoustic\)|\(Demo\)/.test(str)) score -= 5;
    if (/^[\u4e00-\u9fa5]{1,3}$/.test(str)) score += 2;
    if (/^[\u4e00-\u9fa5]{4,}$/.test(str)) score -= 2;

    return score;
  }
};