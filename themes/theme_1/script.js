// ── Theme 1: 清风拂面 — 主题脚本 ──
// 依赖: lottie-web (通过 CDN 加载)

export default {
  id: 1,
  name: '清风拂面',

  // Lottie 实例
  _anim: { vinyl: null, needle: null, robot: null, deco_left: null },
  _container: null,

  // ── 主题激活 ──
  async onActivate(containerEl) {
    this._container = containerEl;

    // 等待 Lottie 库就绪
    if (typeof lottie === 'undefined') {
      await this._loadLottieLib();
    }

    // 创建动画容器
    this._createAnimationContainers();

    // 加载 Lottie 动画
    this._loadAnimations();

    // 监听播放状态
    this._bindPlayEvents();
  },

  // ── 主题停用 ──
  onDeactivate() {
    // 销毁所有 Lottie 实例
    Object.values(this._anim).forEach(a => { if (a) a.destroy(); });
    this._anim = { vinyl: null, needle: null, robot: null, deco_left: null };
    this._container = null;
  },

  // ── 播放状态切换 ──
  onPlayStateChanged(isPlaying) {
    ['vinyl', 'needle'].forEach(key => {
      const anim = this._anim[key];
      if (anim) {
        if (isPlaying) {
          anim.play();
        } else {
          anim.pause();
        }
      }
    });
  },

  // ── 加载 Lottie 库 ──
  _loadLottieLib() {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  },

  // ── 创建动画容器 ──
  _createAnimationContainers() {
    if (!this._container) return;

    const ct = this._container;

    // 唱片动画
    const vinylDiv = document.createElement('div');
    vinylDiv.className = 'th-anim-vinyl';
    vinylDiv.id = 'th1-anim-vinyl';
    // 定位到黑胶位置（与封面 align）
    vinylDiv.style.cssText = 'position:absolute;z-index:4;width:240px;height:240px;top:50%;left:50%;transform:translate(-50%,-60%);pointer-events:none;';
    ct.appendChild(vinylDiv);
    this._animContainers = { vinyl: vinylDiv };

    // 唱针动画
    const needleDiv = document.createElement('div');
    needleDiv.className = 'th-anim-needle';
    needleDiv.id = 'th1-anim-needle';
    needleDiv.style.cssText = 'position:absolute;z-index:5;right:calc(50% - 160px);bottom:270px;width:160px;height:200px;pointer-events:none;';
    ct.appendChild(needleDiv);
    this._animContainers.needle = needleDiv;

    // 机器人动画
    const robotDiv = document.createElement('div');
    robotDiv.className = 'th-anim-robot';
    robotDiv.id = 'th1-anim-robot';
    robotDiv.style.cssText = 'position:absolute;z-index:5;left:8px;bottom:85px;width:65px;pointer-events:none;';
    ct.appendChild(robotDiv);
    this._animContainers.robot = robotDiv;
  },

  // ── 加载 Lottie 动画 ──
  _loadAnimations() {
    if (typeof lottie === 'undefined' || !this._animContainers) return;

    const base = '/themes/theme_1/assets/';

    // 唱片旋转
    if (this._animContainers.vinyl) {
      this._anim.vinyl = lottie.loadAnimation({
        container: this._animContainers.vinyl,
        path: base + 'anim_vinyl.json',
        renderer: 'svg',
        loop: true,
        autoplay: false
      });
    }

    // 唱针
    if (this._animContainers.needle) {
      this._anim.needle = lottie.loadAnimation({
        container: this._animContainers.needle,
        path: base + 'anim_needle.json',
        renderer: 'svg',
        loop: false,
        autoplay: false
      });
    }

    // 机器人
    if (this._animContainers.robot) {
      this._anim.robot = lottie.loadAnimation({
        container: this._animContainers.robot,
        path: base + 'anim_robot.json',
        renderer: 'svg',
        loop: true,
        autoplay: true
      });
    }
  },

  // ── 绑定播放事件 ──
  _bindPlayEvents() {
    // 通过自定义事件与主播放器通信
    const handler = (e) => {
      this.onPlayStateChanged(e.detail);
    };
    document.addEventListener('theme:playstate', handler);
    this._playHandler = handler;
  }
};
