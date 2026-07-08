var songs = [];
var currentSongIndex = 0;
var isShuffle = true;
var isRepeat = false;
var currentHowl = null;
var currentSongId = null;
var lyricsData = [];
var lyricsVisible = false;
var currentLyricIndex = -1;
var currentSongLrcUrl = null;
var lrcLoadId = 0;

function getRandomIndex() {
  if (songs.length <= 1) return 0;
  var idx;
  do { idx = Math.floor(Math.random() * songs.length); }
  while (idx === currentSongIndex);
  return idx;
}

async function loadMusicList() {
  try {
    var res = await fetch('/scripts/music_list.js?' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var text = await res.text();
    var start = text.indexOf('[');
    var end = text.lastIndexOf(']');
    songs = (start !== -1 && end !== -1 && end > start) ? JSON.parse(text.substring(start, end + 1)) : [];
    console.log('🎵 已加载 ' + songs.length + ' 首歌曲');
  } catch (e) {
    console.error('❌ 加载音乐列表失败:', e);
    songs = [];
  }
  if (songs.length === 0) {
    songs = [{ title: '暂无歌曲', artist: '请添加 .mp3 文件到 public/music 目录', cover: '', src: '' }];
  }
  currentSongIndex = Math.floor(Math.random() * songs.length);
  loadSong(songs[currentSongIndex]);
}

function loadEmbeddedCover(mp3Url, callback) {
  if (typeof jsmediatags === 'undefined') { callback(null); return; }
  CoverDB.get(mp3Url).then(function(cached) {
    if (cached) { callback(cached); return; }
    fetch(mp3Url, { method: 'HEAD' }).then(function(r) {
      var size = parseInt(r.headers.get('Content-Length') || '0', 10);
      if (size > 3 * 1024 * 1024) { callback(null); return; }
      readEmbeddedCover(mp3Url, callback);
    }).catch(function() { readEmbeddedCover(mp3Url, callback); });
  });
}
function readEmbeddedCover(mp3Url, callback) {
  try {
    jsmediatags.read(mp3Url, {
      onSuccess: function(tag) {
        var pic = tag.tags && tag.tags.picture;
        if (pic && pic.data) {
          var data = pic.data;
          var bytes = new Uint8Array(data);
          var binary = '';
          for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          var url = 'data:' + (pic.format || 'image/jpeg') + ';base64,' + btoa(binary);
          CoverDB.set(mp3Url, url);
          callback(url);
        } else {
          callback(null);
        }
      },
      onError: function() { callback(null); }
    });
  } catch(e) { callback(null); }
}

// ── 前端兜底：jsmediatags 读取内嵌歌词（缓存 + 跳过大文件）──
function loadEmbeddedLyrics(audioUrl, callback) {
  if (typeof jsmediatags === 'undefined') { callback(null); return; }
  LyricsDB.get(audioUrl).then(function(cached) {
    if (cached) { callback(cached); return; }
    // 大文件跳过 jsmediatags 读取（需下载整个文件才能解析）
    fetch(audioUrl, { method: 'HEAD' }).then(function(r) {
      var size = parseInt(r.headers.get('Content-Length') || '0', 10);
      if (size > 3 * 1024 * 1024) { callback(null); return; }
      readEmbeddedLyrics(audioUrl, callback);
    }).catch(function() { readEmbeddedLyrics(audioUrl, callback); });
  });
}
function readEmbeddedLyrics(audioUrl, callback) {
  try {
    jsmediatags.read(audioUrl, {
      onSuccess: function(tag) {
        var tags = tag.tags || {};
        var lrcText = tags.lyrics || tags.USLT || null;
        if (lrcText && typeof lrcText === 'string' && lrcText.trim()) {
          LyricsDB.set(audioUrl, lrcText);
          callback(lrcText);
        } else if (tags.lyrics) {
          var joined = '';
          for (var i = 0; i < tags.lyrics.length; i++) {
            var l = tags.lyrics[i];
            joined += (typeof l === 'string' ? l : l.text || '') + '\n';
          }
          if (joined.trim()) { LyricsDB.set(audioUrl, joined); callback(joined); }
          else callback(null);
        } else {
          callback(null);
        }
      },
      onError: function() { callback(null); }
    });
  } catch(e) { callback(null); }
}

