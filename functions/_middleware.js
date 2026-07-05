/**
 * Cloudflare Pages Middleware — 统一路由
 *
 * [API]   /api/decrypt-key       → KGM 密钥段 (R2 Range)
 * [Proxy] /public/music/*        → R2 Bucket → 回退静态资源
 * [Inject]/Tools/Metacubexd/zashboard → 浮动导航栏 + SW 注销
 * [Inject]/Music/*               → Wise CSS + KGM 入口 + SW 注销
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// API: KGM 密钥段
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function handleDecryptKey(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      },
    });
  }
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }
  if (!env.MUSIC_BUCKET) {
    return new Response('R2 not configured', { status: 500 });
  }

  const url = new URL(request.url);
  const slots = parseInt(url.searchParams.get('slots') || '0', 10);
  const count = parseInt(url.searchParams.get('count') || '1024', 10);
  const offset = slots;
  const length = Math.min(count, 73155904 - offset);

  if (length <= 0) return new Response('Invalid range', { status: 400 });

  try {
    const obj = await env.MUSIC_BUCKET.get('kugou_key.bin', {
      range: { offset, length },
    });
    if (!obj) return new Response('Key not found', { status: 500 });

    return new Response(await obj.blob(), {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(obj.size),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    console.error('[decrypt-key]', err);
    return new Response(err.message, { status: 500 });
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Proxy: /public/music/* → R2 Bucket
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const MIME_MAP = {
  mp3: 'audio/mpeg', flac: 'audio/flac', m4a: 'audio/mp4',
  ogg: 'audio/ogg', wav: 'audio/wav', aac: 'audio/aac',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif',
  lrc: 'text/plain; charset=utf-8', txt: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml',
};

async function handleMusicProxy(pathname, request, env) {
  if (!env.MUSIC_BUCKET) return null;

  const decodedPath = decodeURIComponent(pathname.replace('/public/music/', ''));
  if (!decodedPath) return null;

  const prefix = 'public/music/';
  const r2Key = prefix + decodedPath;

  try {
    let object = await env.MUSIC_BUCKET.get(r2Key);
    if (object) {
      const headers = new Headers();
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Accept-Ranges', 'bytes');
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');

      const ext = decodedPath.split('.').pop()?.toLowerCase();
      if (MIME_MAP[ext]) headers.set('Content-Type', MIME_MAP[ext]);

      const range = request.headers.get('Range');
      if (range) {
        const [startStr, endStr] = range.replace('bytes=', '').split('-');
        const start = parseInt(startStr, 10);
        const end = endStr ? parseInt(endStr, 10) : object.size - 1;
        const chunk = await object.slice(start, end + 1);
        headers.set('Content-Range', `bytes ${start}-${end}/${object.size}`);
        headers.set('Content-Length', String(chunk.size));
        return new Response(await chunk.arrayBuffer(), { status: 206, headers });
      }

      headers.set('Content-Length', String(object.size));
      return new Response(object.body, { status: 200, headers });
    }
  } catch (e) {
    console.error('[proxy]', decodedPath, e);
  }

  return null; // fallback to Pages static assets
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 导航栏注入
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const NAV_HTML = [
  '<a class="wise-nav-btn wise-nav-btn-home" href="/" aria-label="回到首页">',
  '<span class="material-symbols-rounded">home</span></a>',
  '<button class="wise-nav-btn wise-nav-btn-menu" id="wiseNavToggle" aria-label="打开导航菜单" aria-expanded="false">',
  '<span class="material-symbols-rounded">apps</span></button>',
  '<div class="wise-nav-drawer" id="wiseNavDrawer" aria-hidden="true">',
  '<div class="wise-nav-drawer-panel">',
  '<div class="wise-nav-drawer-header">',
  '<span class="wise-nav-drawer-title">导航菜单</span>',
  '<button class="wise-nav-drawer-close" id="wiseNavDrawerClose" aria-label="关闭导航菜单">',
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">',
  '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  '</svg></button></div></div></div>',
].join('');

const HEAD_INJECT = [
  '<!-- wise-navbar -->',
  '<link rel="stylesheet" href="/Tools/navbar.css">',
  '<script src="/Tools/navbar.js"><\\/script>',
  '<script>',
  '/* 注销 Metacubexd SW */',
  'if("serviceWorker" in navigator){',
  'navigator.serviceWorker.getRegistrations().then(function(regs){',
  'regs.forEach(function(reg){',
  'if(reg.scope.includes("Metacubexd")){',
  'reg.unregister().then(function(s){',
  'console.log("[navbar] SW unregistered:",reg.scope,s)',
  '})',
  '}',
  '})',
  '})}',
  '<\\/script>',
].join('\\n');

class NavbarHeadHandler {
  element(el) { el.prepend(HEAD_INJECT, { html: true }); }
}

class NavbarBodyHandler {
  element(el) {
    const cls = (el.getAttribute('class') || '').trim();
    el.setAttribute('class', cls.includes('navbar-overlay') ? cls : ('navbar-overlay ' + cls).trim());
    el.prepend(NAV_HTML, { html: true });
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Wise Music 注入
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class WiseHeadHandler {
  element(el) {
    el.append('<link href="/style/Music-unlock-injectior-wise-theme.css?v=2" rel="stylesheet">', { html: true });
    el.append([
      '<script>',
      '/* 彻底杀掉 PWA SW，阻止 Vue 重新注册 */',
      'if("serviceWorker" in navigator){',
      '(function killSW(){',
      'navigator.serviceWorker.getRegistrations().then(function(regs){',
      'regs.forEach(function(reg){',
      'if(reg.scope.includes("/Music/")){',
      'reg.unregister();',
      '}',
      '});',
      'caches.keys().then(function(keys){',
      'keys.forEach(function(k){ if(k.includes("music")||k.includes("unlock")) caches.delete(k); });',
      '});',
      '});',
      'setTimeout(killSW,500);',  // 持续清除，防止 Vue 后注册
      '})();',
      'navigator.serviceWorker.addEventListener("controllerchange",function(){ location.reload(); });',
      '}</script>',
    ].join('\\n'), { html: true });
  }
}

class WiseNavHandler {
  element(el) {
    el.setAttribute('href', '/Tools/MusicDecrypt/');
    el.setInnerContent('← KGM 解密', { html: false });
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 路径匹配
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const SKIP_EXTS = new Set([
  'js','mjs','css','png','jpg','jpeg','gif','svg','ico','webp',
  'woff','woff2','ttf','eot','json','webmanifest','xml','txt',
  'map','gz','tgz','zip','pdf','mp4','webm',
]);
const NAVBAR_PATHS = ['/Tools/Metacubexd', '/Tools/zashboard'];
const MUSIC_PATHS = ['/Music'];

function isHtml(pathname, ct) {
  const ext = pathname.split('.').pop()?.toLowerCase();
  if (ext && SKIP_EXTS.has(ext)) return false;
  return (ct || '').includes('text/html') || (ct || '').includes('text/plain');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Middleware
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // ── API: KGM 密钥段 ──
  if (path.startsWith('/api/decrypt-key')) {
    return handleDecryptKey(request, env);
  }

  // ── Proxy: /public/music/* ──
  if (path.startsWith('/public/music/')) {
    const result = await handleMusicProxy(path, request, env);
    if (result) return result;
  }

  // ── Injection ──
  const needsNavbar = NAVBAR_PATHS.some(p => path.startsWith(p));
  const needsWise = MUSIC_PATHS.some(p => path.startsWith(p));

  // 不需要注入 → 交给 next()
  if (!needsNavbar && !needsWise && !path.startsWith('/public/music/')) {
    return next();
  }

  // 注入场景：需要处理 response
  // 但 /public/music/ 在未命中 R2 时也需要 next() 回退到静态资源
  const response = needsNavbar || needsWise
    ? await next()
    : await next(); // for /public/music/ fallback

  if (!isHtml(path, response.headers.get('content-type'))) return response;

  try {
    let rewriter = new HTMLRewriter();
    if (needsNavbar) {
      rewriter = rewriter
        .on('head', new NavbarHeadHandler())
        .on('body', new NavbarBodyHandler());
    }
    if (needsWise) {
      rewriter = rewriter
        .on('head', new WiseHeadHandler())
        .on('.wise-nav-back', new WiseNavHandler());
    }
    return rewriter.transform(response);
  } catch (e) {
    console.error('[middleware]', e);
    return response;
  }
}