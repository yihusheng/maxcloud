/**
 * Cloudflare Pages Middleware — 边缘层实时注入
 *
 * - Metacubexd / zashboard → 注入导航栏 + 注销 SW
 * - Music (音乐解锁)       → 注入 Wise 主题 CSS（更新不丢失）
 */

// ── 导航栏静态 HTML ──
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

// ── 注入到 <head>（导航栏相关）──
const HEAD_INJECT = [
  '<!-- wise-navbar -->',
  '<link rel="stylesheet" href="/Tools/navbar.css">',
  '<script src="/Tools/navbar.js"><\/script>',
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
  '<\/script>',
].join('\n');

// ── 注入到 <head>（Wise 主题相关）──
const WISE_HEAD_INJECT = [
  '<!-- wise-theme -->',
  '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap" rel="stylesheet">',
  '<link href="/style/Music-unlock-injectior-wise-theme.css" rel="stylesheet">',
  '<script>',
  '/* 注销 Music 工具 SW，打破 PWA 缓存，确保边缘注入生效 */',
  'if("serviceWorker" in navigator){',
  'navigator.serviceWorker.getRegistrations().then(function(regs){',
  'regs.forEach(function(reg){',
  'if(reg.scope.includes("/Music/")){',
  'reg.unregister().then(function(s){',
  'console.log("[wise] SW unregistered:",reg.scope,s)',
  '})',
  '}',
  '})',
  '})}',
  '<\/script>',
].join('\n');

// ── 非 HTML 资源扩展名 ──
const SKIP_EXTS = new Set([
  'js','mjs','css','png','jpg','jpeg','gif','svg','ico','webp',
  'woff','woff2','ttf','eot','json','webmanifest','xml','txt',
  'map','gz','tgz','zip','pdf','mp4','webm',
]);

// ── 路径配置 ──
const NAVBAR_PATHS = ['/Tools/Metacubexd', '/Tools/zashboard'];
const MUSIC_PATHS = ['/Music'];

function shouldTransform(pathname, targets) {
  if (!targets.some(p => pathname.startsWith(p))) return false;
  const ext = pathname.split('.').pop()?.toLowerCase();
  if (ext && SKIP_EXTS.has(ext)) return false;
  return true;
}

/* ─── Handlers ─── */

class NavbarHeadHandler {
  element(el) {
    el.prepend(HEAD_INJECT, { html: true });
  }
}

class NavbarBodyHandler {
  element(el) {
    const cls = (el.getAttribute('class') || '').trim();
    const newCls = cls.includes('navbar-overlay') ? cls : ('navbar-overlay ' + cls).trim();
    el.setAttribute('class', newCls);
    el.prepend(NAV_HTML, { html: true });
  }
}

class WiseHeadHandler {
  element(el) {
    el.append(WISE_HEAD_INJECT, { html: true });
  }
}

/* ─── Middleware ─── */

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // 判断需要哪种注入
  const needsNavbar = shouldTransform(path, NAVBAR_PATHS);
  const needsWise = shouldTransform(path, MUSIC_PATHS);

  if (!needsNavbar && !needsWise) {
    return next();
  }

  const response = await next();
  const ct = (response.headers.get('content-type') || '').toLowerCase();
  if (!ct.includes('text/html') && !ct.includes('text/plain')) {
    return response;
  }

  try {
    let rewriter = new HTMLRewriter();

    if (needsNavbar) {
      rewriter = rewriter
        .on('head', new NavbarHeadHandler())
        .on('body', new NavbarBodyHandler());
    }

    if (needsWise) {
      rewriter = rewriter
        .on('head', new WiseHeadHandler());
    }

    return rewriter.transform(response);
  } catch (e) {
    console.error('[middleware] transform error:', e);
    return response;
  }
}
