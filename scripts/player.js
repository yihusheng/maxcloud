// ── 播放器模块（player）──
import { state } from './state.js';
import { wPost, bench, CoverDB, LyricsDB, preloadAudio, preloadAdjacent, ColorUtils, CookieUtils } from './utils.js';
import { updateThemeColor } from './weather.js';

const app = document.getElementById('app');
const THEME_BASE = '/themes/theme_1/assets/';

// ── Lottie 动画实例 ──
const lottieAnims = {};
let lottieLib = null;

// ── CD 唱片机主题切换 ──
let cdThemeActive = true;

export function initCdTheme() {
  const cd = document.getElementById('cdTheme');
  if (!cd) return;

  // 默认激活
  cd.classList.add('active');

  // 加载 Lottie 库
  loadLottieLibrary().then(() => {
    loadCdAnimations();
    // 激活时同步当前播放状态
    if (app.classList.contains('playing')) {
      cdPlay(true);
    } else {
      cdNeedleLift();
    }
  });

  // 绑定主题切换按钮
  const btn = document.getElementById('themeToggle');
  if (btn) {
    btn.classList.add('active');
    btn.addEventListener('click', () => {
      cdThemeActive = !cdThemeActive;
      cd.classList.toggle('active', cdThemeActive);
      btn.classList.toggle('active', cdThemeActive);

      if (cdThemeActive) {
        if (app.classList.contains('playing')) {
          cdPlay(true);
        } else {
          cdNeedleLift();
        }
      } else {
        // 关闭时重置专辑封面样式
        const cover = document.getElementById('mainCover');
        if (cover) {
          cover.style.width = '';
          cover.style.height = '';
          cover.style.maxWidth = '';
          cover.style.borderRadius = '';
          cover.style.boxShadow = '';
        }
      }
    });
  }
}

// ── 加载 Lottie 库 ──
function loadLottieLibrary() {
  return new Promise((resolve) => {
    if (typeof lottie !== 'undefined') { lottieLib = lottie; resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js';
    s.onload = () => { lottieLib = lottie; resolve(); };
    s.onerror = () => { console.warn('Lottie 加载失败'); resolve(); };
    document.head.appendChild(s);
  });
}

// ── 加载 CD 动画 ──
function loadCdAnimations() {
  if (!lottieLib) return;

  const anims = [
    { id: 'vinyl',   container: 'cdVinyl',     path: THEME_BASE + 'anim_vinyl.json',    loop: true,  autoplay: false },
    { id: 'needle',  container: 'cdNeedle',    path: THEME_BASE + 'anim_needle.json',   loop: false, autoplay: false },
    { id: 'robot',   container: 'cdRobotLottie', path: THEME_BASE + 'anim_robot.json',  loop: true,  autoplay: true },
    { id: 'deco',    container: 'cdDecoLottie', path: THEME_BASE + 'anim_deco_left.json', loop: true, autoplay: true },
  ];

  anims.forEach(({ id, container, path, loop, autoplay }) => {
    const el = document.getElementById(container);
    if (!el) return;
    try {
      lottieAnims[id] = lottieLib.loadAnimation({
        container: el,
        path: path,
        renderer: 'svg',
        loop: loop,
        autoplay: autoplay
      });
    } catch (e) {
      console.warn(`Lottie ${id} 加载失败:`, e);
    }
  });

  // 初始状态：唱针抬起
  if (lottieAnims.needle) lottieAnims.needle.goToFrame(0, true);
}

// ── 唱针落下（播放） ──
function cdNeedleDrop() {
  if (!lottieAnims.needle) return;
  try { lottieAnims.needle.playSegments([0, 14], true); } catch (e) {}
}

// ── 唱针抬起（暂停） ──
function cdNeedleLift() {
  if (!lottieAnims.needle) return;
  try { lottieAnims.needle.goToFrame(0, true); } catch (e) {}
}

// ── 黑胶开始旋转 ──
function cdVinylSpin() {
  if (!lottieAnims.vinyl) return;
  try { lottieAnims.vinyl.play(); } catch (e) {}
}

// ── 黑胶停止旋转 ──
function cdVinylStop() {
  if (!lottieAnims.vinyl) return;
  try { lottieAnims.vinyl.pause(); } catch (e) {}
}

// ── 播放状态：开始 ──
function cdPlay(isPlaying) {
  if (isPlaying) {
    cdVinylSpin();
    cdNeedleDrop();
  } else {
    cdVinylStop();
    cdNeedleLift();
  }
}

// ── 歌词开关时淡化主题 ──
function cdLyricsFade(visible) {
  const cd = document.getElementById('cdTheme');
  if (!cd) return;
  cd.classList.toggle('lyrics-open', visible);
}

// ── 播放状态通知 CD 主题 ──
function updateThemePlayState(isPlaying) {
  if (isPlaying) {
    app.classList.add('playing');
  } else {
    app.classList.remove('playing');
  }
  if (cdThemeActive) {
    cdPlay(isPlaying);
  }
}

// ── Cookie 持久化播放状态 ──
function savePlayerState() {
  // 只在用户交互后保存状态
  if (state.currentSongIndex == null || isNaN(state.currentSongIndex)) return;
  var val = JSON.stringify({
    i: state.currentSongIndex,
    s: state.isShuffle ? 1 : 0,
    r: state.isRepeat ? 1 : 0
  });
  CookieUtils.set('player', val, 365);
}
// 每 15 秒保存进度，提高恢复精度
setInterval(function() {
  if (state.currentHowl && state.currentHowl.playing()) {
    var seek = Math.floor(state.currentHowl.seek() || 0);
    var pos = CookieUtils.get('player');
    try {
      var data = JSON.parse(pos || '{}');
      data.p = seek;
      CookieUtils.set('player', JSON.stringify(data), 365);
    } catch(e) {}
  }
}, 15000);

// 播放时标记正在播放（用于恢复）
var origPlaySong = playSong;
playSong = function() {
  if (!state.currentHowl) return;
  origPlaySong();
  var pos = CookieUtils.get('player');
  try {
    var data = JSON.parse(pos || '{}');
    CookieUtils.set('player', JSON.stringify(data), 365);
  } catch(e) {}
};

export async function loadMusicList() {
  // 读取单 Cookie 恢复状态
  try {
    var saved = JSON.parse(CookieUtils.get('player') || '{}');
    if (typeof saved.i === 'number' && !isNaN(saved.i)) {
      state.currentSongIndex = saved.i;
      state.isShuffle = saved.s === 1;
      state.isRepeat = saved.r === 1;
      state._restorePosition = typeof saved.p === 'number' ? saved.p : 0;
      state._restorePlaying = saved.p !== null;
    }
  } catch(e) {}

  // 立即同步按钮状态，不等歌单加载
  document.getElementById('shuffleBtn').classList.toggle('active', state.isShuffle);

  try {
    var r = await fetch('/scripts/music_list.js?' + Date.now(), {
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var text = await r.text();
    var start = text.indexOf('[');
    var end = text.lastIndexOf(']');
    state.songs = (start !== -1 && end !== -1 && end > start) ? JSON.parse(text.substring(start, end + 1)) : [];
    if (!state.songs.length) throw new Error('empty list');
    console.log('🎵 已加载 ' + state.songs.length + ' 首歌曲');
  } catch (e) {
    console.warn('音乐列表加载失败:', e.message || e);
    try {
      var r2 = await fetch('/scripts/music_list.js', { cache: 'reload' });
      if (r2.ok) {
        var text2 = await r2.text();
        var s2 = text2.indexOf('[');
        var e2 = text2.lastIndexOf(']');
        state.songs = (s2 !== -1 && e2 !== -1 && e2 > s2) ? JSON.parse(text2.substring(s2, e2 + 1)) : [];
        if (state.songs.length > 0) {
          console.log('🎵 已加载 ' + state.songs.length + ' 首歌曲');
        } else { throw new Error('empty'); }
      } else { throw new Error('HTTP ' + r2.status); }
    } catch(e2) {
      console.error('全部加载失败:', e2);
      state.songs = [];
    }
  }
  if (state.songs.length === 0) {
    state.songs = [{ title: '暂无歌曲', artist: '请添加 .mp3 文件到 public/music 目录', cover: '', src: '' }];
  }
  // 恢复歌曲
  if (state.songs[state.currentSongIndex]) {
    loadSong(state.songs[state.currentSongIndex]);
    // 恢复播放进度
    if (state._restorePosition > 0) {
      var waitForLoad = setInterval(function() {
        if (state.currentHowl && state.currentHowl.state() === 'loaded') {
          clearInterval(waitForLoad);
          try { state.currentHowl.seek(Math.min(state._restorePosition, state.currentHowl.duration() || 0)); } catch(e) {}
          if (state._restorePlaying) setTimeout(function() { try { state.currentHowl.play(); } catch(e){} }, 200);
          state._restorePosition = 0;
          state._restorePlaying = false;
        }
      }, 100);
      setTimeout(function() { clearInterval(waitForLoad); }, 5000);
    }
  } else {
    state.currentSongIndex = Math.floor(Math.random() * state.songs.length);
    loadSong(state.songs[state.currentSongIndex]);
  }
}

function loadEmbeddedCover(mp3Url, callback) {
  if (typeof jsmediatags === 'undefined') { callback(null); return; }
  CoverDB.get(mp3Url).then(function(cached) {
    if (cached) { callback(cached); return; }
    // jsmediatags 用 Range 请求只下载 ID3 标签部分，不限大小
    readEmbeddedCover(mp3Url, callback);
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
        } else { callback(null); }
      },
      onError: function() { callback(null); }
    });
  } catch(e) { callback(null); }
}

function loadEmbeddedLyrics(audioUrl, callback) {
  if (typeof jsmediatags === 'undefined') { callback(null); return; }
  LyricsDB.get(audioUrl).then(function(cached) {
    if (cached) { callback(cached); return; }
    // 直接用 jsmediatags 读取（R2 代理支持 Range 请求，只下载 ID3 标签部分）
    readEmbeddedLyrics(audioUrl, callback);
  });
}
function readEmbeddedLyrics(audioUrl, callback) {
  try {
    jsmediatags.read(audioUrl, {
      onSuccess: function(tag) {
        var tags = tag.tags || {};
        var lrcText = tags.lyrics || tags.USLT || null;
        if (lrcText && typeof lrcText === 'string' && lrcText.trim()) {
          LyricsDB.set(audioUrl, lrcText); callback(lrcText);
        } else if (tags.lyrics) {
          var joined = '';
          for (var i = 0; i < tags.lyrics.length; i++) {
            var l = tags.lyrics[i];
            joined += (typeof l === 'string' ? l : l.text || '') + '\n';
          }
          if (joined.trim()) { LyricsDB.set(audioUrl, joined); callback(joined); }
          else callback(null);
        } else { callback(null); }
      },
      onError: function() { callback(null); }
    });
  } catch(e) { callback(null); }
}

export function playSong(){ if (!state.currentHowl) return; state.currentHowl.play(); savePlayerState(); }
export function pauseSong(){ if (!state.currentHowl) return; state.currentHowl.pause(); savePlayerState(); }
document.getElementById('playBtn').addEventListener('click',function(){ if (!state.currentHowl) return; state.currentHowl.playing() ? pauseSong() : playSong(); });

export function toggleShuffle() {
  state.isShuffle = !state.isShuffle;
  document.getElementById('shuffleBtn').classList.toggle('active', state.isShuffle);
  savePlayerState();
}
document.getElementById('shuffleBtn').addEventListener('click', toggleShuffle);
document.getElementById('playlistBtn').addEventListener('click', openPlaylist);

function getNextIndex() { if (state.isRepeat) return state.currentSongIndex; return state.isShuffle ? getRandomIndex() : (state.currentSongIndex + 1) % state.songs.length; }
function getPrevIndex() { if (state.isRepeat) return state.currentSongIndex; if (state.isShuffle) return getRandomIndex(); return (state.currentSongIndex - 1 + state.songs.length) % state.songs.length; }

document.getElementById('nextBtn').addEventListener('click', function(){ if(!state.songs.length) return; state.currentSongIndex = getNextIndex(); loadSong(state.songs[state.currentSongIndex]); playSong(); savePlayerState(); });
document.getElementById('prevBtn').addEventListener('click', function(){ if(!state.songs.length) return; state.currentSongIndex = getPrevIndex(); loadSong(state.songs[state.currentSongIndex]); playSong(); savePlayerState(); });

function parseLRC(lrcText) {
  var lines = lrcText.split('\n');
  var result = [];
  var timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var match;
    timeRegex.lastIndex = 0;
    var times = [];
    while ((match = timeRegex.exec(line)) !== null) {
      var mins = parseInt(match[1], 10);
      var secs = parseInt(match[2], 10);
      var ms = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0;
      times.push(mins * 60 + secs + ms / 1000);
    }
    var text = line.replace(/\[.*?\]/g, '').trim();
    if (text) { for (var j = 0; j < times.length; j++) result.push({ time: times[j], text: text }); }
  }
  result.sort(function(a, b) { return a.time - b.time; });
  return result;
}

function loadLyrics(lrcUrl, callback) {
  if (!lrcUrl) { callback(null); return; }
  console.log('📝 加载歌词:', lrcUrl);
  fetch(lrcUrl, { cache: 'no-cache' })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
    .then(function(text) {
      console.log('✅ 歌词加载成功 (' + text.length + ' 字符)');
      var t0 = performance.now();
      wPost('parseLRC', { text: text }, function(m) {
        bench('worker-lrc', performance.now() - t0);
        if (m.data) callback(m.data); else callback(null);
      });
    })
    .catch(function(err) { console.error('❌ 歌词加载失败:', lrcUrl, err.message || err); callback(null); });
}

function renderLyrics() {
  var container = document.getElementById('lyricsContent');
  if (!state.lyricsData || state.lyricsData.length === 0) { container.innerHTML = '<div class="lyrics-empty">暂无歌词</div>'; return; }
  var html = '';
  for (var i = 0; i < state.lyricsData.length; i++) {
    html += '<div class="lyric-line" data-index="' + i + '"><span class="lyric-text">' + state.lyricsData[i].text + '</span></div>';
  }
  container.innerHTML = html;
  var lines = container.querySelectorAll('.lyric-line');
  for (var i = 0; i < lines.length; i++) {
    lines[i].addEventListener('click', function(e) {
      if (e.target.classList.contains('lyric-text')) {
        var idx = parseInt(this.dataset.index, 10);
        if (state.currentHowl && state.lyricsData[idx] && !isNaN(state.lyricsData[idx].time)) {
          state.currentHowl.seek(state.lyricsData[idx].time);
          if (!state.currentHowl.playing()) state.currentHowl.play();
        }
        e.stopPropagation();
      }
    });
  }
}

// ── 更新灵动岛音乐信息 ──
function updateIslandMusic() {
  var song = state.songs[state.currentSongIndex];
  if (!song) return;
  document.getElementById('islandMusicTitle').innerText = song.title || '';
  document.getElementById('islandMusicArtist').innerText = song.artist || '';
  var cover = document.getElementById('mainCover');
  document.getElementById('islandMusicCover').src = cover && cover.src ? cover.src : '';
}
// ── 主封面变更时同步到灵动岛 ──
function syncIslandCover() {
  var island = document.getElementById('island');
  if (!island.classList.contains('music-mode')) return;
  var mc = document.getElementById('mainCover');
  document.getElementById('islandMusicCover').src = mc && mc.src ? mc.src : '';
}

export function toggleLyrics() {
  state.lyricsVisible = !state.lyricsVisible;
  var lv = document.getElementById('lyricsView');
  var island = document.getElementById('island');
  if (state.lyricsVisible) {
    app.classList.add('lyrics-open');
    lv.classList.add('open');
    island.classList.add('music-mode');
    island.classList.remove('active');
    island.classList.remove('weather-detailed');
    updateIslandMusic();
    if (state.lyricsData.length > 0) {
      renderLyrics();
      updateLyricHighlight();
    } else if (state.currentSongLrcUrl) {
      document.getElementById('lyricsContent').innerHTML = '<div class="lyrics-empty">歌词加载中...</div>';
      var lid = ++state.lrcLoadId;
      loadLyrics(state.currentSongLrcUrl, function(data) {
        if (lid !== state.lrcLoadId) return;
        if (data && data.length > 0) { state.lyricsData = data; renderLyrics(); updateLyricHighlight(); }
        else { document.getElementById('lyricsContent').innerHTML = '<div class="lyrics-empty">暂无歌词</div>'; }
      });
    } else {
      document.getElementById('lyricsContent').innerHTML = '<div class="lyrics-empty">歌词加载中...</div>';
      var lid3 = ++state.lrcLoadId;
      loadEmbeddedLyrics(state.songs[state.currentSongIndex] && state.songs[state.currentSongIndex].src, function(lrcText) {
        if (lid3 !== state.lrcLoadId) return;
        if (lrcText) {
          wPost('parseLRC', { text: lrcText }, function(m) {
            if (lid3 !== state.lrcLoadId) return;
            if (m.data && m.data.length > 0) {
              state.lyricsData = m.data;
              renderLyrics();
              updateLyricHighlight();
            } else { document.getElementById('lyricsContent').innerHTML = '<div class="lyrics-empty">暂无歌词</div>'; }
          });
        } else { document.getElementById('lyricsContent').innerHTML = '<div class="lyrics-empty">暂无歌词</div>'; }
      });
    }
    cdLyricsFade(true);
  } else {
    lv.classList.remove('open');
    app.classList.remove('lyrics-open');
    island.classList.remove('music-mode');
    cdLyricsFade(false);
  }
}

function updateLyricHighlight() {
  if (!state.currentHowl || !state.lyricsVisible || !state.lyricsData || state.lyricsData.length === 0) return;
  var seek = state.currentHowl.seek() || 0;
  var newIndex = -1;
  for (var i = 0; i < state.lyricsData.length; i++) {
    if (state.lyricsData[i].time < 0) continue;
    if (state.lyricsData[i].time <= seek) newIndex = i; else break;
  }
  if (newIndex !== state.currentLyricIndex) {
    var items = document.querySelectorAll('.lyric-line');
    for (var i = 0; i < items.length; i++) items[i].classList.remove('active');
    if (newIndex >= 0 && items[newIndex]) { items[newIndex].classList.add('active'); items[newIndex].scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    state.currentLyricIndex = newIndex;
  }
}

export function loadSong(song){
  if (!song || !song.src) { console.warn('loadSong: 无效歌曲'); return; }
  if (!state.songs || state.songs.length === 0) { console.warn('loadSong: 歌曲列表为空'); return; }
  if (state.currentHowl) { state.currentHowl.unload(); state.currentHowl = null; }

  var songId = Date.now(); state.currentSongId = songId;
  document.getElementById('mainTitle').innerText = song.title;
  document.getElementById('mainArtist').innerText = song.artist;
  var mc = document.getElementById('mainCover');

  if (state.lyricsVisible) toggleLyrics();

  updateUI(0);
  updateThemePlayState(false);
  document.getElementById('playIcon').innerText = 'play_arrow';
  state.lyricsData = []; state.currentLyricIndex = -1;
  state.currentSongLrcUrl = song.lrc || null; state.lrcLoadId = 0;

  var fallback = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 280"><rect fill="#e8ebe6" width="280" height="280"/><text x="140" y="155" font-size="64" text-anchor="middle" fill="#868685">\u266a</text></svg>');
  var _cv=song.cover;if(_cv&&_cv.indexOf('./')===0)_cv='/'+_cv.slice(2);
  // 封面预加载：新封面图片加载完成后再替换，避免闪烁
  var newSrc = _cv || fallback;
  if (newSrc !== mc.src) {
    var preloadImg = new Image();
    preloadImg.onload = function() { if (songId === state.currentSongId) { mc.src = preloadImg.src; } };
    preloadImg.onerror = function() {
      // 加载失败时尝试从 MP3 内嵌提取
      if (songId === state.currentSongId) { mc.src = fallback; }
      loadEmbeddedCover(song.src, function(dataUrl) {
        if (dataUrl && songId === state.currentSongId) mc.src = dataUrl;
      });
    };
    preloadImg.src = newSrc;
  } else if (!mc.src) {
    mc.src = fallback;
  }
  mc.onerror = function() { /* handled by preloadImg */ };
  updateMediaSession(song.title, song.artist, mc.src, song.cover);

  CoverDB.get(song.src).then(function(cached) {
    if (songId !== state.currentSongId || !cached) return;
    if (mc.src !== cached) { mc.src = cached; updateMediaSession(song.title, song.artist, mc.src, song.cover); syncIslandCover(); }
    var t0 = performance.now();
    wPost('extractColor', { url: mc.src }, function(m) {
      bench('worker-color', performance.now() - t0);
      if (m.rgb) { var t = ColorUtils.generateTheme(m.rgb); for (var k in t) document.documentElement.style.setProperty(k, t[k]); updateThemeColor(); }
    });
  });

  loadEmbeddedCover(song.src, function(coverDataUrl) {
    if (songId !== state.currentSongId) return;
    if (coverDataUrl) {
      CoverDB.set(song.src, coverDataUrl);
      if (mc.src !== coverDataUrl) {
        mc.src = coverDataUrl;
        updateMediaSession(song.title, song.artist, mc.src, song.cover);
        syncIslandCover();
        var t0 = performance.now();
        wPost('extractColor', { url: coverDataUrl }, function(m) {
          bench('worker-color', performance.now() - t0);
          if (m.rgb) { var t = ColorUtils.generateTheme(m.rgb); for (var k in t) document.documentElement.style.setProperty(k, t[k]); updateThemeColor(); }
        });
      }
    } else if (song.cover && mc.src !== song.cover) {
      var _cv2=song.cover;if(_cv2&&_cv2.indexOf('./')===0)_cv2='/'+_cv2.slice(2);mc.src=_cv2;
      updateMediaSession(song.title, song.artist, mc.src, song.cover);
      syncIslandCover();
    }
  });

  document.getElementById('playIcon').innerText = 'hourglass_empty';
  document.getElementById('playBtn').style.opacity = '0.6';

  state.currentHowl = new Howl({
    src: [song.src], html5: true, preload: 'metadata',
    onload: function() {
      if (songId !== state.currentSongId) return;
      var dur = state.currentHowl.duration();
      document.getElementById('durTime').innerText = isNaN(dur) ? '0:00' : Math.floor(dur/60)+':'+String(Math.floor(dur%60)).padStart(2,'0');
      document.getElementById('playIcon').innerText = 'play_arrow';
      document.getElementById('playBtn').style.opacity = '';
      preloadAudio(state.currentSongIndex);
    },
    onplay: function() {
      if (songId !== state.currentSongId) return;
      updateThemePlayState(true);
      document.getElementById('playIcon').innerText = 'pause';
      document.getElementById('playBtn').style.opacity = '';
      setPlaybackState('playing');
    },
    onpause: function() {
      if (songId !== state.currentSongId) return;
      updateThemePlayState(false);
      document.getElementById('playIcon').innerText = 'play_arrow';
      setPlaybackState('paused');
    },
    onend: function() {
      if (songId !== state.currentSongId) return;
      document.getElementById('nextBtn').click();
    },
    onloaderror: function(id, err) {
      console.error('加载失败:', song.src, err);
      if (songId !== state.currentSongId) return;
      document.getElementById('playIcon').innerText = 'play_arrow';
      document.getElementById('playBtn').style.opacity = '';
      showToast('歌曲加载失败，请检查文件或网络');
    }
  });

  if (song.lrc) {
    var lid = ++state.lrcLoadId;
    loadLyrics(song.lrc, function(data) {
      if (lid !== state.lrcLoadId) return;
      if (data && data.length > 0) { state.lyricsData = data; if (state.lyricsVisible) { renderLyrics(); updateLyricHighlight(); } }
    });
  }

  if (!song.lrc) {
    var lid2 = ++state.lrcLoadId;
    loadEmbeddedLyrics(song.src, function(lrcText) {
      if (lid2 !== state.lrcLoadId) return;
      if (lrcText) {
        wPost('parseLRC', { text: lrcText }, function(m) {
          if (lid2 !== state.lrcLoadId) return;
          if (m.data && m.data.length > 0) {
            state.lyricsData = m.data;
            if (state.lyricsVisible) { renderLyrics(); updateLyricHighlight(); }
          }
        });
      }
    });
  }

  mc.onload = function() { updateMediaSession(song.title, song.artist, mc.src, song.cover); syncIslandCover(); };
  if (mc.complete) mc.onload();
  updateMediaSession(song.title, song.artist, mc.src, song.cover);

  preloadAdjacent(state.currentSongIndex);
  savePlayerState();
}

var isDragging = false;
var audioSlider = document.getElementById('audioSlider'), activeTrack = document.getElementById('activeTrack'), inactiveTrack = document.getElementById('inactiveTrack'), sliderThumb = document.getElementById('sliderThumb');

function updateUI(p) {
  p = isNaN(p) ? 0 : Math.max(0, Math.min(100, p));
  audioSlider.value = p; activeTrack.style.width = p + '%'; inactiveTrack.style.left = p + '%'; inactiveTrack.style.width = (100 - p) + '%'; sliderThumb.style.left = p + '%';
  var cur = isDragging ? p / 100 * (state.currentHowl ? state.currentHowl.duration() : 0) : (state.currentHowl ? state.currentHowl.seek() : 0);
  document.getElementById('currTime').innerText = (isNaN(cur) || cur === null) ? '0:00' : Math.floor(cur/60)+':'+String(Math.floor(cur%60)).padStart(2,'0');
  var dur = state.currentHowl ? state.currentHowl.duration() : NaN;
  document.getElementById('durTime').innerText = (isNaN(dur) || dur === null) ? '0:00' : Math.floor(dur/60)+':'+String(Math.floor(dur%60)).padStart(2,'0');
}

function progressLoop() {
  if (state.currentHowl && state.currentHowl.playing() && !isDragging) {
    var seek = state.currentHowl.seek() || 0; var dur = state.currentHowl.duration() || 0;
    if (dur > 0) updateUI(seek / dur * 100);
  }
  if (state.lyricsVisible) updateLyricHighlight();
  requestAnimationFrame(progressLoop);
}
requestAnimationFrame(progressLoop);

// setPositionState 单独用 1s 定时器，避免 60fps 无效调用
setInterval(function() {
  if (state.currentHowl && state.currentHowl.playing()) {
    var seek = Math.floor(state.currentHowl.seek() || 0);
    if (seek !== setPositionState._lastSeek) {
      setPositionState._lastSeek = seek;
      setPositionState(state.currentHowl.duration() || 0, seek);
    }
  }
}, 1000);

audioSlider.addEventListener('input', function() { isDragging = true; updateUI(audioSlider.value); });
audioSlider.addEventListener('change', function() { isDragging = false; if (state.currentHowl) { var d = state.currentHowl.duration() || 0; state.currentHowl.seek(audioSlider.value / 100 * d); setPositionState(d, state.currentHowl.seek() || 0); } });

function updateMediaSession(title, artist, coverUrl, songCover) {
  if (!('mediaSession' in navigator)) return;
  try {
    var artSrc = '';
    if (songCover && songCover.indexOf('data:') !== 0) { artSrc = songCover; }
    else if (coverUrl && coverUrl.indexOf('data:') !== 0) { artSrc = coverUrl; }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title || '', artist: artist || '', album: '',
      artwork: artSrc ? [{ src: artSrc, sizes: '256x256', type: 'image/jpeg' }, { src: artSrc, sizes: '512x512', type: 'image/jpeg' }] : []
    });
  } catch(e) {}
}
function setPlaybackState(state) { if ('mediaSession' in navigator) try { navigator.mediaSession.playbackState = state; } catch(e) {} }
function setPositionState(dur, pos) {
  if ('mediaSession' in navigator && navigator.mediaSession.setPositionState) {
    try { navigator.mediaSession.setPositionState({ duration: dur || 0, playbackRate: 1, position: pos || 0 }); } catch(e) {}
  }
}
if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', playSong);
  navigator.mediaSession.setActionHandler('pause', pauseSong);
  navigator.mediaSession.setActionHandler('previoustrack', function(){ document.getElementById('prevBtn').click(); });
  navigator.mediaSession.setActionHandler('nexttrack', function(){ document.getElementById('nextBtn').click(); });
  navigator.mediaSession.setActionHandler('seekto', function(details) { if (state.currentHowl && details.seekTime != null) state.currentHowl.seek(details.seekTime); });
  navigator.mediaSession.setActionHandler('seekbackward', function() { if (state.currentHowl) state.currentHowl.seek(Math.max(0, (state.currentHowl.seek() || 0) - 10)); });
  navigator.mediaSession.setActionHandler('seekforward', function() { if (state.currentHowl) state.currentHowl.seek(Math.min(state.currentHowl.duration() || 0, (state.currentHowl.seek() || 0) + 10)); });
}

// ── Toast 提示 ──
function showToast(msg) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.style.opacity = '1';
  if (showToast._timer) clearTimeout(showToast._timer);
  showToast._timer = setTimeout(function() { el.style.opacity = '0'; }, 3000);
}

document.addEventListener('keydown', function(e){
  if (e.key === ' ') { e.preventDefault(); if (state.currentHowl) state.currentHowl.playing() ? pauseSong() : playSong(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); document.getElementById('prevBtn').click(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); document.getElementById('nextBtn').click(); }
});

export async function loadBingWallpaper(){
  if (window.innerWidth < 768) return;
  try {
    var r = await fetch('https://bing.biturl.top/?resolution=1920&format=json&index=0&mkt=zh-CN');
    var d = await r.json();
    if (d.url) {
      var u = d.url;
      var img = new Image();
      img.onload = function() { document.body.style.backgroundImage = 'url(' + u + ')'; };
      img.src = u;
    }
    if (d.copyright) { showWallpaperInfo(d.copyright, d.copyright_link || 'https://www.bing.com'); }
  } catch(e) {}
}

function showWallpaperInfo(text, linkUrl) {
  var el = document.getElementById('wallpaperInfo');
  if (!el) {
    el = document.createElement('div');
    el.id = 'wallpaperInfo'; el.className = 'wallpaper-info';
    document.body.appendChild(el);
  }
  var desc = text.replace(/\s*\(.*?\)\s*$/, '').trim() || text;
  var credit = text.match(/\(([^)]+)\)/);
  var creditText = credit ? credit[0] : '';
  el.innerHTML = '<span class="wallpaper-desc">' + desc + '</span> <span class="wallpaper-credit">' + creditText + '</span>';
  el.onclick = function() { window.open(linkUrl, '_blank'); };
  el.style.cursor = 'pointer';
}

document.querySelector('.player-content').addEventListener('click', function(e) {
  if (e.target.closest('.m3-slider-root, .time-labels, .controls')) return;
  toggleLyrics();
});

export function openPlaylist() {
  var overlay = document.getElementById('playlistOverlay');
  if (!state.songs || state.songs.length === 0) return;
  renderPlaylist();
  overlay.classList.add('open');
}
export function closePlaylist() { document.getElementById('playlistOverlay').classList.remove('open'); }
export function renderPlaylist() {
  var body = document.getElementById('playlistBody');
  var repeatBtn = document.getElementById('playlistRepeatBtn');
  repeatBtn.classList.toggle('active', state.isRepeat);
  document.getElementById('playlistCount').textContent = state.songs.length + ' 首';
  var html = '';
  for (var i = 0; i < state.songs.length; i++) {
    var song = state.songs[i];
    var isActive = i === state.currentSongIndex;
    var thumbSrc = song.cover || '';
    html += '<div class="playlist-item' + (isActive ? ' active' : '') + '" data-index="' + i + '">' +
      '<img class="playlist-item-thumb" src="' + (thumbSrc || 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44"><rect fill="#e8ebe6" width="44" height="44"/><text x="22" y="28" font-size="20" text-anchor="middle" fill="#868685">\u266a</text></svg>')) + '" alt="" loading="lazy">' +
      '<div class="playlist-item-info"><div class="playlist-item-title">' + song.title + '</div><div class="playlist-item-artist">' + song.artist + '</div></div>' +
      '<div class="playlist-item-indicator"></div><span class="playlist-item-index">' + (i + 1) + '</span></div>';
  }
  body.innerHTML = html;
  var items = body.querySelectorAll('.playlist-item');
  for (var i = 0; i < items.length; i++) {
    items[i].addEventListener('click', function() {
      var idx = parseInt(this.dataset.index, 10);
      if (idx === state.currentSongIndex) { closePlaylist(); return; }
      state.currentSongIndex = idx;
      loadSong(state.songs[idx]);
      playSong();
      renderPlaylist();
    });
  }
}
document.getElementById('playlistBackdrop').addEventListener('click', closePlaylist);
document.getElementById('playlistHandle').addEventListener('click', closePlaylist);
document.getElementById('playlistRepeatBtn').addEventListener('click', function() {
  state.isRepeat = !state.isRepeat;
  this.classList.toggle('active', state.isRepeat);
  savePlayerState();
});
