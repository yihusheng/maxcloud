// ── Theme 1: 清风拂面 ──
// CD 唱片机主题：静态场景 + Lottie 唱片/唱针/机器人动画

const MANIFEST = '/themes/theme_1/manifest.json';
const BASE = '/themes/theme_1/';

let manifest = null;
let lottieLoaded = false;
const animInstances = {};
let containerEl = null;
let playHandler = null;

// ── 加载 Lottie 库 ──
function loadLottieLib() {
  return new Promise((resolve, reject) => {
    if (typeof lottie !== 'undefined') { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js';
    s.onload = resolve;
    s.onerror = () => {
      console.warn('Lottie 加载失败，使用 CSS 回退');
      reject();
    };
    document.head.appendChild(s);
  });
}

// ── 加载 manifest ──
async function loadManifest() {
  if (manifest) return manifest;
  try {
    const r = await fetch(MANIFEST);
    manifest = await r.json();
    return manifest;
  } catch (e) {
    console.error('Theme manifest load failed', e);
    return null;
  }
}

// ── 创建 Lottie 容器 ──
function createAnimContainer(parent, className, styles) {
  const div = document.createElement('div');
  div.className = className;
  Object.assign(div.style, styles);
  parent.appendChild(div);
  return div;
}

// ── 创建静态图 ──
function createStaticImg(parent, className, src, styles) {
  const div = document.createElement('div');
  div.className = className;
  Object.assign(div.style, styles || {});
  div.innerHTML = `<img src="${BASE}${src}" alt="" loading="lazy" style="width:100%;height:auto;display:block;">`;
  parent.appendChild(div);
  return div;
}

// ═══════════════════════════════════════════
// 主题生命周期
// ═══════════════════════════════════════════

export default {
  id: 1,
  name: '清风拂面',

  async onActivate(container) {
    containerEl = container;
    const m = await loadManifest();
    if (!m) return;

    // —— 1. 静态图片层 ——
    createStaticImg(container, 'th-scenes',   m.r_img.scenes.file);
    createStaticImg(container, 'th-shelf',    m.r_img.shelf.file);
    createStaticImg(container, 'th-player-body', m.r_img.recordplayer.file);
    if (m.r_img.decorate_left)  createStaticImg(container, 'th-deco-left',  m.r_img.decorate_left.file);
    if (m.r_img.decorate_right) createStaticImg(container, 'th-deco-right', m.r_img.decorate_right.file);

    // —— 2. Lottie 动画层 ——
    try {
      await loadLottieLib();
      lottieLoaded = true;

      const anims = m.r_animation;

      // 唱片动画 (vinyl)
      if (anims.vinyl) {
        const vc = createAnimContainer(container, 'th-lottie-vinyl', {
          position:'absolute', zIndex:5, pointerEvents:'none',
          top:'50%', left:'50%', transform:'translate(-50%, -62%)',
          width:'240px', height:'240px'
        });
        animInstances.vinyl = lottie.loadAnimation({
          container: vc, path: BASE + anims.vinyl.file,
          renderer: 'svg', loop: true, autoplay: false
        });
      }

      // 唱针动画 (needle)
      if (anims.needle) {
        const nc = createAnimContainer(container, 'th-lottie-needle', {
          position:'absolute', zIndex:6, pointerEvents:'none',
          right:'calc(50% - 175px)', bottom:'44%',
          width:'160px', height:'200px'
        });
        animInstances.needle = lottie.loadAnimation({
          container: nc, path: BASE + anims.needle.file,
          renderer: 'svg', loop: false, autoplay: false
        });
        // 停在第一帧（唱针抬起状态）
        animInstances.needle.goToFrame(0, true);
      }

      // 机器人动画
      if (anims.robot) {
        const rc = createAnimContainer(container, 'th-lottie-robot', {
          position:'absolute', zIndex:5, pointerEvents:'none',
          left:'3%', bottom:'26%', width:'18%', maxWidth:'75px'
        });
        animInstances.robot = lottie.loadAnimation({
          container: rc, path: BASE + anims.robot.file,
          renderer: 'svg', loop: true, autoplay: true
        });
      }

      // 装饰动画
      if (anims.decorate_left) {
        const dc = createAnimContainer(container, 'th-lottie-deco-left', {
          position:'absolute', zIndex:4, pointerEvents:'none',
          left:'5%', bottom:'44%', width:'20%', maxWidth:'80px'
        });
        animInstances.deco_left = lottie.loadAnimation({
          container: dc, path: BASE + anims.decorate_left.file,
          renderer: 'svg', loop: true, autoplay: true
        });
      }

    } catch (e) {
      console.warn('Lottie animations not available, using CSS fallback');
    }

    // —— 3. 监听播放状态 ——
    this._bindPlayEvents();

    // —— 4. 通知当前播放状态 ——
    const app = document.getElementById('app');
    if (app && app.classList.contains('playing')) {
      this.onPlayStateChanged(true);
    }
  },

  onDeactivate() {
    // 销毁 Lottie
    Object.values(animInstances).forEach(a => { if (a && a.destroy) a.destroy(); });
    Object.keys(animInstances).forEach(k => delete animInstances[k]);

    // 移除事件
    if (playHandler) {
      document.removeEventListener('theme:playstate', playHandler);
      playHandler = null;
    }
    containerEl = null;
    lottieLoaded = false;
  },

  onPlayStateChanged(isPlaying) {
    if (!lottieLoaded) return;

    // 唱片旋转
    if (animInstances.vinyl) {
      if (isPlaying) animInstances.vinyl.play();
      else animInstances.vinyl.pause();
    }

    // 唱针：播放时落到唱片上，暂停时抬起
    if (animInstances.needle) {
      if (isPlaying) {
        // 播放唱针下落动画
        animInstances.needle.playSegments([0, 15], true);
      } else {
        // 唱针抬起（回到第一帧）
        animInstances.needle.goToFrame(0, true);
      }
    }

    // 机器人随音乐轻微律动（已有自动循环，无需额外处理）
    // 后续可添加：根据音乐节奏加速/减速机器人动画
  },

  _bindPlayEvents() {
    if (playHandler) return;
    playHandler = (e) => {
      this.onPlayStateChanged(e.detail);
    };
    document.addEventListener('theme:playstate', playHandler);
  }
};
