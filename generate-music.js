/**
 * generate-music.js
 * 扫描 public/music 目录，提取 MP3 / FLAC / M4A / OGG 等格式的内置封面和歌词，
 * 生成 scripts/music_list.js (位于 scripts/ 目录)
 *
 * 用法: node generate-music.js
 */

const fs = require('fs');
const path = require('path');
const mm = require('music-metadata');

const musicDir = path.join(__dirname, 'public', 'music');
const outputFile = path.join(__dirname, 'scripts', 'music_list.js');

const AUDIO_EXTS = new Set(['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.mp4', '.wma']);
const COVER_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
const LYRIC_EXTS = ['.lrc', '.txt'];

// URL 编码（保持与浏览器 music.json 一致）
function urlSafe(s) { return encodeURIComponent(s).replace(/%20/g, '+'); }

function getCoverExt(mime) {
  const map = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
  };
  return map[mime] || '.jpg';
}

// 兜底解析 ID3v2 USLT 歌词帧（music-metadata 可能遗漏）
// 按照 encoding 字节正确解码歌词文本，返回 UTF-8 编码的 Buffer
function extractUSLT(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    if (buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return null; // not ID3
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    const tagEnd = 10 + size;
    let pos = 10;
    while (pos + 10 <= tagEnd) {
      const frameId = buf.toString('ascii', pos, pos + 4);
      const frameSize = (buf[pos+4] << 24) | (buf[pos+5] << 16) | (buf[pos+6] << 8) | buf[pos+7];
      if (frameId === 'USLT') {
        // encoding(1) + language(3) + content descriptor(null-term) + lyrics data
        const enc = buf[pos + 10];
        let lyricsStart = pos + 14; // skip encoding + language
        // 跳过 null-terminated 的内容描述符
        // UTF-16（enc=1/2）下 null 终止符为 00 00（双字节）
        if (enc === 1 || enc === 2) {
          while (lyricsStart + 1 < tagEnd && (buf[lyricsStart] !== 0 || buf[lyricsStart + 1] !== 0)) lyricsStart += 2;
          lyricsStart += 2; // skip null terminator (2 bytes)
        } else {
          while (lyricsStart < tagEnd && buf[lyricsStart] !== 0) lyricsStart++;
          lyricsStart++; // skip null (1 byte)
        }
        const lyricsEnd = pos + 10 + frameSize;
        if (lyricsStart < lyricsEnd) {
          let lyrics;
          if (enc === 1 || enc === 2) { // UTF-16 with/without BOM
            lyrics = buf.toString('utf16le', lyricsStart, lyricsEnd);
          } else if (enc === 3) { // UTF-8
            lyrics = buf.toString('utf8', lyricsStart, lyricsEnd);
          } else { // 0 = ISO-8859-1 (Latin-1) — 很多旧标签实际存的是 UTF-8，先试 UTF-8
            const raw8 = buf.toString('utf8', lyricsStart, lyricsEnd);
            // 检查是否有效的 UTF-8（包含中文等多字节字符时不包含 \uFFFD）
            if (!raw8.includes('\uFFFD')) {
              lyrics = raw8;
            } else {
              lyrics = buf.toString('latin1', lyricsStart, lyricsEnd);
            }
          }
          if (lyrics) {
            lyrics = lyrics.replace(/^\uFEFF/, '').trim(); // strip BOM
            if (lyrics) return Buffer.from(lyrics, 'utf8');
          }
        }
      }
      pos += 10 + frameSize;
      // skip padding
      while (pos < tagEnd && buf[pos] === 0) pos++;
    }
  } catch (e) {
    console.warn(`    USLT 解析失败: ${e.message}`);
  }
  return null;
}

(async () => {
  let files;
  try {
    files = fs.readdirSync(musicDir);
  } catch (e) {
    console.error('❌ 无法读取 public/music 目录:', e.message);
    process.exit(1);
  }

  const audioFiles = files.filter(f => AUDIO_EXTS.has(path.extname(f).toLowerCase()));
  if (audioFiles.length === 0) {
    console.log('⚠️  没有找到音频文件');
    fs.writeFileSync(outputFile, 'var musicList = ' + JSON.stringify([], null, 2) + ';\n');
    process.exit(0);
  }

  // ── 读取旧歌单（保留已有记录，避免覆盖 R2 中已存在的歌）──
  var oldMap = {};
  if (fs.existsSync(outputFile)) {
    try {
      var oldText = fs.readFileSync(outputFile, 'utf-8');
      var oldStart = oldText.indexOf('[');
      var oldEnd = oldText.lastIndexOf(']');
      if (oldStart !== -1 && oldEnd > oldStart) {
        var oldList = JSON.parse(oldText.substring(oldStart, oldEnd + 1));
        for (var i = 0; i < oldList.length; i++) {
          // 用 src 中的文件名作为 key（去重依据）
          var key = oldList[i].src;
          if (key) oldMap[key] = oldList[i];
        }
        console.log('📂 保留 ' + Object.keys(oldMap).length + ' 首已有歌曲');
      }
    } catch (e) {
      console.warn('⚠️  读取旧歌单失败:', e.message);
    }
  }

  const songs = [];

  for (const audioFile of audioFiles) {
    const ext = path.extname(audioFile).toLowerCase();
    const baseName = path.basename(audioFile, ext);
    const filePath = path.join(musicDir, audioFile);

    let title = baseName;
    let artist = '';
    let extractedCover = null;
    let extractedLyrics = null;

    try {
      const metadata = await mm.parseFile(filePath, {
        duration: false,
        skipPostHeaders: false,
      });
      const common = metadata.common;

      // 标题 / 艺术家 / 专辑
      if (common.title) title = common.title;
      if (common.artist) artist = common.artist;

      // 提取内嵌封面
      if (common.picture && common.picture.length > 0) {
        const pic = common.picture[0];
        const imgExt = getCoverExt(pic.format);
        const coverFile = baseName + imgExt;
        const coverPath = path.join(musicDir, coverFile);

        if (!fs.existsSync(coverPath)) {
          fs.writeFileSync(coverPath, Buffer.from(pic.data));
          console.log(`  📸 提取封面: ${coverFile}  (${audioFile})`);
        }
        extractedCover = coverFile;
      }

      // 提取内嵌歌词
      if (common.lyrics && common.lyrics.length > 0) {
        const lyricsText = common.lyrics
          .map(l => {
            if (typeof l === 'string') return l;
            if (l.time != null) {
              const t = l.time;
              const mins = Math.floor(t / 60);
              const secs = Math.floor(t % 60);
              const cs = Math.floor((t % 1) * 100);
              return `[${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(cs).padStart(2, '0')}]${l.text || ''}`;
            }
            return l.text || '';
          })
          .filter(Boolean)
          .join('\n');
        if (lyricsText.trim()) {
          const lrcFile = baseName + '.lrc';
          const lrcPath = path.join(musicDir, lrcFile);
          if (!fs.existsSync(lrcPath)) {
            fs.writeFileSync(lrcPath, lyricsText, 'utf-8');
            console.log(`  📝 提取歌词: ${lrcFile}  (${audioFile})`);
          }
          extractedLyrics = lrcFile;
        }
      }

      // 兜底：music-metadata 未提取到歌词时，手动解析 MP3 ID3v2 USLT
      if (!extractedLyrics && ext === '.mp3') {
        const usltBuf = extractUSLT(filePath);
        if (usltBuf) {
          const lrcFile = baseName + '.lrc';
          const lrcPath = path.join(musicDir, lrcFile);
          if (!fs.existsSync(lrcPath)) {
            fs.writeFileSync(lrcPath, usltBuf); // 写出原始编码，不转换
            console.log(`  📝 提取歌词(USLT兜底): ${lrcFile}  (${audioFile})`);
          }
          extractedLyrics = lrcFile;
        }
      }
    } catch (e) {
      console.warn(`  ⚠️  解析失败: ${audioFile} — ${e.message}`);
    }

    // 文件名解析（仅当 tag 没有提供 artist 时）
    if (!artist) {
      const dashIdx = baseName.indexOf(' - ');
      if (dashIdx > 0) {
        artist = baseName.substring(0, dashIdx).trim();
        title = baseName.substring(dashIdx + 3).trim();
      } else {
        artist = 'Unknown';
      }
    }

    // 外部封面（优先级低于嵌入式，但检查是否已有文件）
    let coverFile = extractedCover;
    if (!coverFile) {
      for (const ext of COVER_EXTS) {
        if (files.includes(baseName + ext)) {
          coverFile = baseName + ext;
          break;
        }
      }
    }

    // 外部歌词
    let lrcFile = extractedLyrics;
    if (!lrcFile) {
      for (const ext of LYRIC_EXTS) {
        const lrcPath = path.join(musicDir, baseName + ext);
        if (fs.existsSync(lrcPath)) {
          lrcFile = baseName + ext;
          break;
        }
      }
    }

    const song = {
      title,
      artist,
      src: `./public/music/${audioFile}`,
    };

    if (coverFile) {
      song.cover = `./public/music/${coverFile}`;
    }
    if (lrcFile) {
      song.lrc = `./public/music/${lrcFile}`;
    }

    songs.push(song);
  }

  // ── 合并旧歌（本地没扫到但之前已存在 R2 中的歌）──
  // 旧歌的 cover/lrc 文件在 R2 中，不在 repo checkout 里，所以不校验本地文件
  // 去重 key 使用 URL 解码后的文件名，避免 URL 编码版本（%20/%E4等）与原始 UTF-8 版本视为不同歌曲
  function normalizeSrc(src) {
    try { return decodeURIComponent(src); } catch(e) { return src; }
  }
  var newKeys = {};
  for (var i = 0; i < songs.length; i++) newKeys[normalizeSrc(songs[i].src)] = true;
  for (var key in oldMap) {
    var oldSrc = oldMap[key].src;
    if (!newKeys[normalizeSrc(oldSrc)]) {
      var oldSong = oldMap[key];
      // 保留原有 cover/lrc 引用 —— 文件在 R2 中，不在 repo checkout
      songs.push(oldSong);
      console.log(`  🔄 保留: ${oldSong.artist} - ${oldSong.title}${oldSong.cover ? ' 🖼️' : ''}${oldSong.lrc ? ' 📝' : ''}`);
    }
  }

  // 按文件名排序
  songs.sort((a, b) => a.src.localeCompare(b.src));

  fs.writeFileSync(outputFile, 'var musicList = ' + JSON.stringify(songs, null, 2) + ';\n', 'utf-8');
  console.log(`\n✅ 已生成 music_list.js，共 ${songs.length} 首`);
  songs.forEach((s, i) => {
    const hasCover = s.cover ? ' 🖼️' : '';
    const hasLrc = s.lrc ? ' 📝' : '';
    console.log(`   ${String(i + 1).padStart(2)}. ${s.artist} - ${s.title}${hasCover}${hasLrc}`);
  });
})();
