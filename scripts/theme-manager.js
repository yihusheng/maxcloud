// ── Theme Manager v2 — 主题加载/切换/联动 ──

export class ThemeManager {
  constructor() {
    this.currentThemeId = null;
    this.themes = new Map();
    this.themeLayer = null;
    this.activeModule = null;
    this._styleEl = null;
    this._initialized = false;
  }

  // 主动初始化（由 init.js 调用）
  async init() {
    if (this._initialized) return;
    this._initialized = true;
    await this._init();
  }

  async _init() {
    // 创建主题层
    this.themeLayer = document.createElement('div');
    this.themeLayer.id = 'themeLayer';
    this.themeLayer.className = 'theme-layer';

    const pc = document.querySelector('.player-content');
    if (pc) {
      const bg = pc.querySelector('.player-background');
      pc.insertBefore(this.themeLayer, bg ? bg.nextSibling : pc.firstChild);
    }

    // 扫描主题
    await this._scanThemes();

    // 默认激活主题 1
    if (this.themes.has(1)) await this.activateTheme(1);

    // 绑定开关
    this._bindToggle();
  }

  async _scanThemes() {
    for (const id of [1, 2, 3]) {
      try {
        const r = await fetch(`/themes/theme_${id}/manifest.json`);
        if (r.ok) this.themes.set(id, await r.json());
      } catch (_) {}
    }
  }

  async activateTheme(id) {
    if (this.currentThemeId === id) return;
    this._cleanup();

    const m = this.themes.get(id);
    if (!m) return;

    // 设置标识
    this.currentThemeId = id;
    const app = document.getElementById('app');
    if (app) {
      app.setAttribute('data-theme-id', id);
      app.classList.add('theme-active');
    }

    // 加载 CSS
    await this._loadCSS(id);

    // 清空并注入静态资源（由 script.js 负责渲染）
    this.themeLayer.innerHTML = '';

    // 加载并激活主题脚本
    await this._loadScript(id);

    // 淡入
    requestAnimationFrame(() => { this.themeLayer.classList.add('active'); });
  }

  deactivateTheme() {
    this._cleanup();
    const app = document.getElementById('app');
    if (app) {
      app.removeAttribute('data-theme-id');
      app.classList.remove('theme-active');
    }
  }

  toggleTheme(id) {
    if (this.currentThemeId === id) this.deactivateTheme();
    else this.activateTheme(id);
  }

  notifyPlayState(isPlaying) {
    if (this.activeModule && this.activeModule.onPlayStateChanged) {
      this.activeModule.onPlayStateChanged(isPlaying);
    }
    // 发送自定义事件，让主题脚本也能监听
    document.dispatchEvent(new CustomEvent('theme:playstate', { detail: isPlaying }));
  }

  _cleanup() {
    // 停用脚本
    if (this.activeModule) {
      try { this.activeModule.onDeactivate(); } catch (_) {}
      this.activeModule = null;
    }
    // 移除 CSS
    if (this._styleEl) {
      this._styleEl.remove();
      this._styleEl = null;
    }
    // 清空层
    if (this.themeLayer) {
      this.themeLayer.classList.remove('active');
      this.themeLayer.innerHTML = '';
    }
    this.currentThemeId = null;
  }

  async _loadCSS(id) {
    try {
      const r = await fetch(`/themes/theme_${id}/style.css`);
      if (r.ok) {
        this._styleEl = document.createElement('style');
        this._styleEl.textContent = await r.text();
        this._styleEl.dataset.theme = id;
        document.head.appendChild(this._styleEl);
      }
    } catch (_) {}
  }

  async _loadScript(id) {
    try {
      const mod = await import(`/themes/theme_${id}/script.js`);
      if (mod.default && mod.default.onActivate) {
        this.activeModule = mod.default;
        await this.activeModule.onActivate(this.themeLayer);
      }
    } catch (e) {
      console.warn(`Theme ${id} script error:`, e);
    }
  }

  _bindToggle() {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const nextId = this.currentThemeId ? null : 1;
      if (nextId) {
        this.activateTheme(nextId);
        btn.classList.add('active');
      } else {
        this.deactivateTheme();
        btn.classList.remove('active');
      }
    });
    // 初始状态
    btn.classList.add('active');
  }
}

// 单例
export const themeManager = new ThemeManager();
