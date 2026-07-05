// ── 应用入口 ──
// 移除加载态，防止 HTML 占位符闪烁
document.body.classList.remove('js-loading');

import { setCookieUtils, initI18n } from './i18n.js';
import './drawer.js'; // 侧效加载：渲染抽屉 + 事件绑定
import { updateTime, fetchWeather, updateThemeColor } from './weather.js';
import { loadMusicList, loadBingWallpaper } from './player.js';
import { initIsland } from './island.js';
import { CookieUtils } from './utils.js';
import { themeManager } from './theme-manager.js';

// 注入 CookieUtils 到 i18n（避免循环依赖）
setCookieUtils(CookieUtils);

// 国际化 & 主题恢复
initI18n();
var savedTheme = CookieUtils.get('theme');
if (savedTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');

// 天气 & 时间
updateTime(); setInterval(updateTime, 1e3);
fetchWeather(); setInterval(fetchWeather, 6e5);
updateThemeColor();

// 壁纸
loadBingWallpaper();
window.addEventListener('resize', function(){ if (window.innerWidth >= 768) loadBingWallpaper(); });

// 灵动岛
initIsland();

// 主题管理器初始化
themeManager.init();

// 音乐（不阻塞 UI）
loadMusicList();
