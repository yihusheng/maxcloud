/**
 * ═══════════════════════════════════════════════════════════════
 *  Wise Navbar — 可拖拽导航按钮 + 动态图标
 *  - 首页按钮图标根据当前页面动态变化
 *  - 两枚按钮可拖拽移动，位置存入 localStorage
 *  - SPA 同样生效
 * ═══════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  const NAV_ITEMS = [
    { icon: 'home',             label: '首页',        href: '/' },
    { icon: 'language',        label: 'Unicode',     href: '/Tools/UnicodeChars/' },
    { icon: 'calculate',        label: '双浮点计算器',      href: '/Tools/Double/' },
    { icon: 'lan',              label: 'MAC查询',    href: '/Tools/MacQuery/' },
    { icon: 'format_underlined',label: '下划线生成器',      href: '/Tools/Underline/' },
    { icon: 'functions',        label: '营养计算器',      href: '/Tools/Calculator/' },
    { icon: 'open_in_new',      label: '跳转工具',    href: '/Tools/JumpTools/' },
    { icon: 'device_hub',       label: 'UA查询',     href: '/Tools/UaQuery/' },
    { icon: 'dashboard',        label: 'Metacubexd',  href: '/Tools/Metacubexd/' },
  ];

  window.WiseNavbarData = NAV_ITEMS.slice();

  // ── localStorage keys ──
  var POS_HOME = 'wise-nav-home-pos';
  var POS_MENU = 'wise-nav-menu-pos';
  var DRAG_THRESHOLD = 6;

  // ═══════════════════════════════════
  //  Homepage detection (DOM-aware)
  // ═══════════════════════════════════
  function isHomePage() {
    var path = window.location.pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '') || '/';
    if (path === '/' || path === '/Music') return true;
    if (document.getElementById('drawerSections')) return true;
    if (document.querySelector('.phone-screen')) return true;
    if (document.querySelector('.dynamic-island')) return true;
    return false;
  }

  // ═══════════════════════════════════
  //  Dynamic home icon
  // ═══════════════════════════════════
  function updateHomeIcon() {
    var iconEl = document.querySelector('.wise-nav-btn-home .material-symbols-rounded');
    if (!iconEl) return;

    var curPath = window.location.pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '') || '/';
    if (curPath === '/') { iconEl.textContent = 'home'; return; }

    var icon = 'home';
    for (var i = 0; i < NAV_ITEMS.length; i++) {
      var target = NAV_ITEMS[i].href.replace(/\/index\.html$/, '').replace(/\/+$/, '') || '/';
      if (curPath === target || (target !== '/' && curPath.startsWith(target))) {
        icon = NAV_ITEMS[i].icon;
        break;
      }
    }
    iconEl.textContent = icon;
  }

  // ═══════════════════════════════════
  //  Injection helpers
  // ═══════════════════════════════════
  function injectFonts() {
    if (document.querySelector('link[href*="Material+Symbols+Rounded"')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,1,0';
    document.head.appendChild(link);
  }

  function injectSpacerCSS() {
    var p = window.location.pathname;
    var style = document.createElement('style');
    style.id = 'wiseNavbarSpacerCSS';
    style.textContent =
      'body { padding-top: 62px !important; }' +
      'body > #app { padding-top: 62px !important; box-sizing: border-box !important; }' +
      'body > #__nuxt { padding-top: 62px !important; box-sizing: border-box !important; }';
    document.head.appendChild(style);
  }

  function buildDrawerLinks() {
    var cur = window.location.pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '') || '/';
    var html = '';
    for (var i = 0; i < NAV_ITEMS.length; i++) {
      var item = NAV_ITEMS[i];
      var target = item.href.replace(/\/index\.html$/, '').replace(/\/+$/, '') || '/';
      var act = (cur === target || (target !== '/' && cur.startsWith(target))) ? ' active' : '';
      html += '<a class="wise-nav-drawer-link' + act + '" href="' + item.href + '">' +
        '<span class="nv-icon material-symbols-rounded">' + item.icon + '</span>' +
        item.label + '</a>';
    }
    return html;
  }

  function buildHTML() {
    return '' +
      '<a class="wise-nav-btn wise-nav-btn-home" href="/" aria-label="回到首页">' +
        '<span class="material-symbols-rounded">home</span></a>' +
      '<button class="wise-nav-btn wise-nav-btn-menu" id="wiseNavToggle" aria-label="打开导航菜单" aria-expanded="false">' +
        '<span class="material-symbols-rounded">apps</span></button>' +
      '<div class="wise-nav-drawer" id="wiseNavDrawer" aria-hidden="true">' +
        '<div class="wise-nav-drawer-panel">' +
          '<div class="wise-nav-drawer-header">' +
            '<span class="wise-nav-drawer-title">导航菜单</span>' +
            '<button class="wise-nav-drawer-close" id="wiseNavDrawerClose" aria-label="关闭导航菜单">' +
              '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
                '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' +
              '</svg></button></div>' +
          buildDrawerLinks() +
        '</div></div>';
  }

  function populateDrawer() {
    var panel = document.querySelector('.wise-nav-drawer-panel');
    if (!panel) return;
    if (panel.querySelector('.wise-nav-drawer-link')) return;
    panel.insertAdjacentHTML('beforeend', buildDrawerLinks());
  }

  function inject() {
    if (document.getElementById('wiseNavToggle')) return;
    injectFonts();
    injectSpacerCSS();
    document.body.insertAdjacentHTML('beforeend', buildHTML());
  }

  // ═══════════════════════════════════
  //  Drawer events
  // ═══════════════════════════════════
  function bindEvents() {
    var toggle = document.getElementById('wiseNavToggle');
    var drawer = document.getElementById('wiseNavDrawer');
    var close  = document.getElementById('wiseNavDrawerClose');
    if (!toggle || !drawer) return;

    function open() {
      drawer.classList.add('open');
      drawer.setAttribute('aria-hidden', 'false');
      toggle.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    }
    function closeDrawer() {
      drawer.classList.remove('open');
      drawer.setAttribute('aria-hidden', 'true');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }

    toggle.addEventListener('click', function(e) {
      e.stopPropagation();
      if (drawer.classList.contains('open')) { closeDrawer(); } else { open(); }
    });
    if (close) close.addEventListener('click', closeDrawer);
    drawer.addEventListener('click', function(e) { if (e.target === drawer) closeDrawer(); });
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeDrawer(); });
    var links = drawer.querySelectorAll('.wise-nav-drawer-link');
    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener('click', closeDrawer);
    }
  }

  // ═══════════════════════════════════
  //  Drag system
  // ═══════════════════════════════════
  function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

  function getStoredPos(key) {
    try {
      var raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch(e) {}
    return null;
  }

  function savePos(key, x, y) {
    try { localStorage.setItem(key, JSON.stringify({ x: x, y: y })); } catch(e) {}
  }

  function getBtnSize(btn) {
    return {
      w: btn.offsetWidth  || 42,
      h: btn.offsetHeight || 42
    };
  }

  function restorePosition(btn, posKey, defaultSide) {
    var stored = getStoredPos(posKey);
    var size = getBtnSize(btn);
    var margin = window.innerWidth >= 768 ? 24 : 16;
    var top = window.innerWidth >= 768 ? 24 : 16;

    if (stored && typeof stored.x === 'number' && typeof stored.y === 'number') {
      var x = clamp(stored.x, 0, window.innerWidth - size.w);
      var y = clamp(stored.y, 0, window.innerHeight - size.h);
      btn.style.left = x + 'px';
      btn.style.top  = y + 'px';
      btn.style.right = 'auto';
    } else if (defaultSide === 'right') {
      btn.style.left = (window.innerWidth - size.w - margin) + 'px';
      btn.style.top  = top + 'px';
      btn.style.right = 'auto';
    }
  }

  function makeDraggable(btn, posKey) {
    if (!btn) return;

    var startX, startY, startLeft, startTop;
    var isDragging = false;
    var hasMoved = false;

    function onDown(e) {
      if (e.target.closest('.wise-nav-drawer')) return;
      isDragging = true;
      hasMoved = false;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = parseInt(getComputedStyle(btn).left) || 0;
      startTop  = parseInt(getComputedStyle(btn).top)  || 0;
      btn.classList.add('dragging');
      btn.setPointerCapture(e.pointerId);
    }

    function onMove(e) {
      if (!isDragging) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      if (!hasMoved && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
        hasMoved = true;
      }
      if (!hasMoved) return;
      var size = getBtnSize(btn);
      var x = clamp(startLeft + dx, 0, window.innerWidth  - size.w);
      var y = clamp(startTop  + dy, 0, window.innerHeight - size.h);
      btn.style.left = x + 'px';
      btn.style.top  = y + 'px';
      btn.style.right = 'auto';
    }

    function onUp(e) {
      if (!isDragging) return;
      isDragging = false;
      btn.classList.remove('dragging');
      try { btn.releasePointerCapture(e.pointerId); } catch(_) {}
      if (hasMoved) {
        var x = parseInt(btn.style.left) || 0;
        var y = parseInt(btn.style.top)  || 0;
        savePos(posKey, x, y);
        e.preventDefault();
      }
    }

    function onClick(e) {
      if (hasMoved) {
        e.preventDefault();
        e.stopPropagation();
        hasMoved = false;
      }
    }

    btn.addEventListener('pointerdown', onDown);
    btn.addEventListener('pointermove', onMove);
    btn.addEventListener('pointerup',   onUp);
    btn.addEventListener('pointercancel', onUp);
    btn.addEventListener('click', onClick, true);
  }

  function initDrag() {
    var homeBtn = document.querySelector('.wise-nav-btn-home');
    var menuBtn = document.querySelector('.wise-nav-btn-menu');
    if (homeBtn) { restorePosition(homeBtn, POS_HOME, 'left');  makeDraggable(homeBtn, POS_HOME); }
    if (menuBtn) { restorePosition(menuBtn, POS_MENU, 'right'); makeDraggable(menuBtn, POS_MENU); }
  }

  // ═══════════════════════════════════
  //  Init
  // ═══════════════════════════════════
  function doInit() {
    if (isHomePage()) return;

    document.body.classList.remove('navbar-overlay');
    var alreadyExists = !!document.getElementById('wiseNavToggle');
    if (!alreadyExists) {
      injectFonts();
      injectSpacerCSS();
      inject();
    } else {
      injectFonts();
      populateDrawer();
    }

    bindEvents();
    updateHomeIcon();
    initDrag();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', doInit);
  } else {
    doInit();
  }
})();
