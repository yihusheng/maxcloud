// ── Theme Manager — 主题加载/切换管理器 ──
// 负责加载主题 manifest、注入 CSS、激活 JS、处理切换

const THEMES_DIR = '/themes';

export class ThemeManager {
  constructor() {
    this.currentThemeId = null;
    this.themes = new Map();
    this.themeLayer = null;
    this.activeInstance = null;
    this._styleEl = null;

    // 等待 DOM 就绪
    if (document.readyState === 'complete') {
      this._init();
    } else {
      window.addEventListener('load', () => this._init());
    }
  }

  async _init() {
    // 创建主题层容器
    this.themeLayer = document.createElement('div');
    this.themeLayer.className = 'theme-layer';
    this.themeLayer.id = 'themeLayer';
    this.themeLayer.style.cssText = 'position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none;opacity:0;transition:opacity 0.6s ease;';

    const playerContent = document.querySelector('.player-content');
    if (playerContent) {
      // 插入到 player-background 之后
      const bg = playerContent.querySelector('.player-background');
      if (bg && bg.nextSibling) {
        playerContent.insertBefore(this.themeLayer, bg.nextSibling);
      } else {
        playerContent.prepend(this.themeLayer);
      }
    }

    // 加载可用主题列表
    await this._scanThemes();

    // 默认激活主题 1
    if (this.themes.has(1)) {
      await this.activateTheme(1);
    }

    // 绑定开关按钮
    this._bindToggle();
  }

  // 扫描主题目录
  async _scanThemes() {
    // 目前硬编码已知主题；后续可动态从 /themes/index.json 加载
    const knownThemes = [1, 2, 3];
    for (const id of knownThemes) {
      try {
        const r = await fetch(`${THEMES_DIR}/theme_${id}/manifest.json`);
        if (r.ok) {
          const manifest = await r.json();
          this.themes.set(id, manifest);
        }
      } catch(e) {
        // 主题不存在或不完整
      }
    }
  }

  // 激活主题
  async activateTheme(themeId) {
    if (this.currentThemeId === themeId) return;
    const manifest = this.themes.get(themeId);
    if (!manifest) return;

    // 停用当前
    if (this.activeInstance) {
      this.activeInstance.onDeactivate();
      this.activeInstance = null;
    }

    // 移除旧 style
    if (this._styleEl) {
      this._styleEl.remove();
      this._styleEl = null;
    }

    // 清空主题层
    this.themeLayer.innerHTML = '';
    this.themeLayer.style.opacity = '0';

    // 加载静态资源
    this._renderStaticAssets(manifest);

    // 注入 CSS
    await this._loadThemeCSS(themeId);

    // 加载并激活 JS
    await this._loadThemeScript(themeId);

    // 设置标识
    this.currentThemeId = themeId;
    document.getElementById('app')?.setAttribute('data-theme-id', themeId);
    document.getElementById('app')?.classList.add('theme-active');

    // 淡入
    requestAnimationFrame(() => {
      this.themeLayer.style.opacity = '1';
    });
  }

  // 渲染静态图片层
  _renderStaticAssets(manifest) {
    const base = `${THEMES_DIR}/theme_${manifest.theme_id}/`;
    const img = manifest.r_img;

    // 场景
    if (img.scenes) {
      const div = document.createElement('div');
      div.className = 'th-scenes';
      div.innerHTML = `<img src="${base}${img.scenes}" alt="" loading="lazy">`;
      this.themeLayer.appendChild(div);
    }

    // 置物架
    if (img.shelf) {
      const div = document.createElement('div');
      div.className = 'th-shelf';
      div.innerHTML = `<img src="${base}${img.shelf}" alt="" loading="lazy">`;
      this.themeLayer.appendChild(div);
    }

    // 唱机本体
    if (img.recordplayer) {
      const div = document.createElement('div');
      div.className = 'th-player-body';
      div.innerHTML = `<img src="${base}${img.recordplayer}" alt="" loading="lazy">`;
      this.themeLayer.appendChild(div);
    }

    // 装饰左
    if (img.decorate_left) {
      const div = document.createElement('div');
      div.className = 'th-deco-left';
      div.innerHTML = `<img src="${base}${img.decorate_left}" alt="" loading="lazy">`;
      this.themeLayer.appendChild(div);
    }

    // 装饰右
    if (img.decorate_right) {
      const div = document.createElement('div');
      div.className = 'th-deco-right';
      div.innerHTML = `<img src="${base}${img.decorate_right}" alt="" loading="lazy">`;
      this.themeLayer.appendChild(div);
    }
  }

  // 加载主题 CSS
  async _loadThemeCSS(themeId) {
    try {
      const r = await fetch(`${THEMES_DIR}/theme_${themeId}/style.css`);
      if (r.ok) {
        const css = await r.text();
        this._styleEl = document.createElement('style');
        this._styleEl.textContent = css;
        this._styleEl.dataset.themeId = themeId;
        document.head.appendChild(this._styleEl);
      }
    } catch(e) {
      console.warn(`Theme ${themeId} CSS load failed`);
    }
  }

  // 加载主题脚本
  async _loadThemeScript(themeId) {
    try {
      const module = await import(`${THEMES_DIR}/theme_${themeId}/script.js`);
      if (module.default && module.default.onActivate) {
        this.activeInstance = module.default;
        await this.activeInstance.onActivate(this.themeLayer);
      }
    } catch(e) {
      console.warn(`Theme ${themeId} JS load failed:`, e);
    }
  }

  // 切换主题
  toggleTheme(themeId) {
    if (this.currentThemeId === themeId) {
      // 关闭主题
      this.deactivateTheme();
    } else {
      this.activateTheme(themeId);
    }
  }

  // 停用主题
  deactivateTheme() {
    if (this.activeInstance) {
      this.activeInstance.onDeactivate();
      this.activeInstance = null;
    }
    this.themeLayer.style.opacity = '0';
    this.themeLayer.innerHTML = '';
    if (this._styleEl) {
      this._styleEl.remove();
      this._styleEl = null;
    }
    this.currentThemeId = null;
    document.getElementById('app')?.removeAttribute('data-theme-id');
    document.getElementById('app')?.classList.remove('theme-active');
  }

  // 绑定开关按钮
  _bindToggle() {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.currentThemeId) {
        this.deactivateTheme();
        btn.classList.remove('active');
      } else {
        this.activateTheme(1);
        btn.classList.add('active');
      }
    });
  }

  // 外部通知播放状态变化
  notifyPlayState(isPlaying) {
    if (this.activeInstance && this.activeInstance.onPlayStateChanged) {
      this.activeInstance.onPlayStateChanged(isPlaying);
    }
  }
}

// ── 单例导出 ──
export const themeManager = new ThemeManager();
