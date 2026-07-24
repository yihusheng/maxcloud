/**
 * MaxCloud Web Worker — 并行处理
 * 处理：封面颜色提取、LRC 歌词解析
 */
self.addEventListener('message', async function (e) {
  var msg = e.data;
  if (!msg || typeof msg !== 'object') return;
  var type = msg.type;
  var id = msg.id;

  // 输入校验
  if (typeof type !== 'string' || typeof id !== 'number') return;

  if (type === 'extractColor') {
    if (typeof msg.url !== 'string' || msg.url.length > 2048) return;
    try {
      var rgb = await extractColorFromUrl(msg.url);
      self.postMessage({ type: 'extractColor', id: id, rgb: rgb, t: performance.now() });
    } catch (err) {
      self.postMessage({ type: 'extractColor', id: id, rgb: { r: 100, g: 145, b: 65 }, error: true, t: performance.now() });
    }
  } else if (type === 'parseLRC') {
    if (typeof msg.text !== 'string' || msg.text.length > 1048576) return; // 最大 1MB
    try {
      var result = parseLRC(msg.text);
      self.postMessage({ type: 'parseLRC', id: id, data: result, t: performance.now() });
    } catch (err) {
      self.postMessage({ type: 'parseLRC', id: id, data: [], error: true, t: performance.now() });
    }
  } else if (type === 'loadMusicList') {
    // [Worker] 加载音乐列表：网络请求 + JSON 解析，不阻塞主线程
    console.log('[Worker] loadMusicList: 开始请求 /music_list.js');
    try {
      var songs = await fetchMusicList();
      self.postMessage({ type: 'loadMusicList', id: id, data: songs, t: performance.now() });
      console.log('[Worker] loadMusicList: ✅ 成功加载 ' + songs.length + ' 首歌曲');
    } catch (err) {
      console.error('[Worker] loadMusicList 失败:', err.message);
      try {
        var songs = await fetchMusicListFallback();
        self.postMessage({ type: 'loadMusicList', id: id, data: songs, t: performance.now() });
        console.log('[Worker] loadMusicList 兜底成功: ' + songs.length + ' 首歌曲');
      } catch (err2) {
        console.error('[Worker] loadMusicList 全部失败:', err2.message);
        self.postMessage({ type: 'loadMusicList', id: id, data: [], error: true, errorMsg: err2.message, t: performance.now() });
      }
    }
  }
});

// ── 音乐列表加载（Worker 内 fetch + JSON 解析，释放主线程）──
async function fetchMusicList() {
  var r = await fetch('/music_list.js?' + Date.now(), {
    signal: AbortSignal.timeout(8000)
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  var text = await r.text();
  var start = text.indexOf('[');
  var end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) throw new Error('invalid format');
  var songs = JSON.parse(text.substring(start, end + 1));
  if (!songs.length) throw new Error('empty list');
  return songs;
}

async function fetchMusicListFallback() {
  var r = await fetch('/music_list.js', { cache: 'reload' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  var text = await r.text();
  var start = text.indexOf('[');
  var end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) throw new Error('invalid format');
  var songs = JSON.parse(text.substring(start, end + 1));
  if (!songs.length) throw new Error('empty list');
  return songs;
}

// ── 颜色提取 (OffscreenCanvas) ──
async function extractColorFromUrl(url) {
  var resp = await fetch(url, { mode: 'cors' });
  var blob = await resp.blob();
  var bitmap = await createImageBitmap(blob);
  var canvas = new OffscreenCanvas(50, 50);
  var ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, 50, 50);
  bitmap.close();

  var d = ctx.getImageData(0, 0, 50, 50).data;
  var r = 0, g = 0, b = 0, t = 0;
  for (var j = 0; j < d.length; j += 4) {
    var br = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
    var w = br < 50 ? 2 : 1;
    r += d[j] * w;
    g += d[j + 1] * w;
    b += d[j + 2] * w;
    t += w;
  }
  if (t > 0) { r = Math.floor(r / t); g = Math.floor(g / t); b = Math.floor(b / t); }
  return { r: r, g: g, b: b };
}

// ── LRC 歌词解析 ──
function parseLRC(lrcText) {
  var lines = lrcText.split('\n');
  var result = [];
  var timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;
  var anyTimed = false;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var match;
    timeRegex.lastIndex = 0;
    var times = [];
    while ((match = timeRegex.exec(line)) !== null) {
      anyTimed = true;
      var mins = parseInt(match[1], 10);
      var secs = parseInt(match[2], 10);
      var ms = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0;
      times.push(mins * 60 + secs + ms / 1000);
    }
    var text = line.replace(/\[.*?\]/g, '').trim();
    if (text) {
      if (times.length > 0) {
        for (var j = 0; j < times.length; j++) {
          result.push({ time: times[j], text: text });
        }
      }
    }
  }

  // 纯文本歌词（无时间标签）：每行作为独立条目
  if (!anyTimed && result.length === 0) {
    for (var k = 0; k < lines.length; k++) {
      var t = lines[k].trim();
      if (t) result.push({ time: -1, text: t });
    }
  }

  result.sort(function (a, b) { return a.time - b.time; });
  return result;
}
