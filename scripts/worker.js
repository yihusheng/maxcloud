/**
 * MaxCloud Web Worker — 并行处理
 * 处理：封面颜色提取、LRC 歌词解析、音乐列表加载
 *
 * 所有消息处理都包裹 try-catch，确保始终回复主线程。
 */

// ── 全局未捕获错误兜底（确保 Worker 不会静默死亡）──
self.onerror = function(msg, src, line, col, err) {
  console.error('[Worker] ⚠️ 全局错误:', msg, 'at', line + ':' + col);
  // 无法回复主线程（不知道 id），只能 log
};
self.addEventListener('unhandledrejection', function(e) {
  console.error('[Worker] ⚠️ 未处理的 Promise 拒绝:', e.reason ? (e.reason.message || e.reason) : e);
});

self.addEventListener('message', async function (e) {
  var msg = e.data;
  if (!msg || typeof msg !== 'object') return;
  var type = msg.type;
  var id = msg.id;

  // 输入校验
  if (typeof type !== 'string' || typeof id !== 'number') return;

  try {
    if (type === 'extractColor') {
      if (typeof msg.url !== 'string' || msg.url.length > 2048) throw new Error('invalid url');
      var rgb = await extractColorFromUrl(msg.url);
      self.postMessage({ type: 'extractColor', id: id, rgb: rgb, t: performance.now() });

    } else if (type === 'parseLRC') {
      if (typeof msg.text !== 'string' || msg.text.length > 1048576) throw new Error('invalid text');
      var result = parseLRC(msg.text);
      self.postMessage({ type: 'parseLRC', id: id, data: result, t: performance.now() });

    } else if (type === 'loadMusicList') {
      console.log('[Worker] loadMusicList: 开始请求 /music_list.js');
      var songs = await fetchMusicListWithFallback();
      self.postMessage({ type: 'loadMusicList', id: id, data: songs, t: performance.now() });
      console.log('[Worker] loadMusicList: ✅ 成功加载 ' + songs.length + ' 首歌曲');

    } else {
      // 未知类型也回复，避免主线程悬空等待
      self.postMessage({ type: type, id: id, data: [], error: true, errorMsg: 'unknown type: ' + type });
    }
  } catch (err) {
    console.error('[Worker] 处理失败 type=' + type + ':', err.message || err);
    // 即使全部失败也回复空数组，让主线程知道可以降级
    self.postMessage({ type: type, id: id, data: [], error: true, errorMsg: err.message || String(err), t: performance.now() });
  }
});

// ── 音乐列表加载（带超时 + 兜底重试）──
async function fetchMusicListWithFallback() {
  try {
    return await fetchMusicList('/music_list.js?' + Date.now(), 5000);
  } catch (err) {
    console.warn('[Worker] fetchMusicList 失败:', err.message, '→ 兜底重试');
    return await fetchMusicList('/music_list.js', 5000);
  }
}

async function fetchMusicList(url, timeoutMs) {
  var controller = new AbortController();
  var timer = setTimeout(function() { controller.abort(); }, timeoutMs);
  try {
    var r = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var text = await r.text();
    var start = text.indexOf('[');
    var end = text.lastIndexOf(']');
    if (start === -1 || end === -1 || end <= start) throw new Error('invalid format');
    var songs = JSON.parse(text.substring(start, end + 1));
    if (!songs.length) throw new Error('empty list');
    return songs;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
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
