/**
 * Wise Theme Injector — Cloudflare Worker
 *
 * 对所有 /Music/* 的 HTML 页面进行边缘注入：
 * - Wise 主题 CSS
 * - 返回主页按钮 → 改为 KGM 解密入口
 * - 注销 PWA Service Worker（打破缓存）
 *
 * 注入 → 页面即更新，无需修改源文件。
 */

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/Music')) {
      return fetch(request);
    }

    const response = await fetch(request);
    const ct = response.headers.get('content-type') || '';

    if (!ct.includes('text/html') && !ct.includes('text/plain')) {
      return response;
    }

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
          el.setAttribute('href', '/Tools/KgmDecrypt/');
          el.setInnerContent('KGM 解密');
          el.removeAttribute('class');
          el.setAttribute('class', 'wise-nav-kgm');
        },
      })
      .transform(response);
  },
};