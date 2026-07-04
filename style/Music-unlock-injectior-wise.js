/**
 * Wise Theme Injector — Cloudflare Worker
 *
 * 对所有 /Music/* 的 HTML 页面进行边缘注入：
 * - Wise 主题 CSS
 * - KGM 解密入口链接（注入到 wise-nav 中）
 * - 注销 PWA Service Worker（打破缓存）
 *
 * 注入 → 页面即更新，无需修改源文件。
 */

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Only process Music tool HTML pages
    if (!url.pathname.startsWith('/Music')) {
      return fetch(request);
    }

    const response = await fetch(request);
    const contentType = response.headers.get('content-type') || '';

    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return response;
    }

    // Inject CSS + KGM link + SW unregister
    return new HTMLRewriter()
      .on('head', {
        element(el) {
          el.append(
            '<link href="/style/Music-unlock-injectior-wise-theme.css" rel="stylesheet">',
            { html: true }
          );
          el.append([
            '<script>',
            '/* 注销 PWA SW，确保边缘注入生效 */',
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
            '</script>',
          ].join('\n'), { html: true });
        },
      })
      .on('.wise-nav-back', {
        element(el) {
          el.prepend(
            '<a href="/Tools/KgmDecrypt/" class="wise-nav-kgm">KGM 解密</a>',
            { html: true }
          );
        },
      })
      .transform(response);
  },
};
