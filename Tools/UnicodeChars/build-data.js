/**
 * build-data.js — 从 /workspace/emoji/ 提取 Emoji 数据
 * 分类名 = 文件夹名，保留杂项兜底
 */
const fs = require('fs');
const path = require('path');

const EMOJI_DIR = '/workspace/emoji';
const OUTPUT_DIR = '/workspace/maxcloud/Tools/UnicodeChars';

// ── 文件夹 → 分类ID映射 ──
const FOLDER_MAP = [
  { id:'smileys',     folder:'黄脸', label:'😀 黄脸' },
  { id:'gestures',    folder:'手势', label:'🤚 手势' },
  { id:'actions',     folder:'动作', label:'💃 动作' },
  { id:'family',      folder:'家庭', label:'👨‍👩‍👧‍👦 家庭' },
  { id:'professions', folder:'职业', label:'👔 职业' },
  { id:'animals',     folder:'动物', label:'🐾 动物' },
  { id:'plants',      folder:'植物', label:'🌱 植物' },
  { id:'weather',     folder:'天气', label:'🌤 天气' },
  { id:'food',        folder:'食物', label:'🍎 食物' },
  { id:'sports',      folder:'运动', label:'⚽ 运动' },
  { id:'transport',   folder:'交通', label:'🚗 交通' },
  { id:'scenery',     folder:'景物', label:'🏔 景物' },
  { id:'objects',     folder:'物品', label:'💡 物品' },
  { id:'clothing',    folder:'服饰', label:'👗 服饰' },
  { id:'hearts',      folder:'心形', label:'❤ 心形' },
  { id:'signs',       folder:'标志', label:'🔣 标志' },
  { id:'markers',     folder:'标识', label:'📌 标识' },
  { id:'notation',    folder:'记号', label:'✏ 记号' },
  { id:'math',        folder:'数学', label:'∑ 数学' },
  { id:'featured',    folder:'精选', label:'⭐ 精选' },
];

// Quick lookup: folder Chinese name -> category ID
const FOLDER_TO_ID = {};
for (const fm of FOLDER_MAP) FOLDER_TO_ID[fm.folder] = fm.id;

// ── 标准 Emoji 检测范围（同 isEmojiChar） ──
const STANDARD_EMOJI_RANGES = [
  [0x1F600,0x1F64F],[0x1F300,0x1F5FF],[0x1F680,0x1F6FF],[0x1F900,0x1F9FF],
  [0x1FA00,0x1FA6F],[0x1FA70,0x1FAFF],[0x1F1E6,0x1F1FF],[0x1F400,0x1F43F],
  [0x1F440,0x1F487],[0x1F490,0x1F53F],[0x2600,0x27BF],[0x231A,0x23FF],
  [0x24C2,0x24C2],[0x25AA,0x25FE],[0x2934,0x2935],[0x2B05,0x2B55],
  [0x3030,0x303D],[0x3297,0x3299],[0x1F9B0,0x1F9FF],[0x1FAB0,0x1FABF],
  [0x1FAC0,0x1FACF],[0x1FAD0,0x1FAFF],[0x1FAE0,0x1FAEF],[0x1FAF0,0x1FAFF],
  [0x1F9D1,0x1F9DF],[0x1F91A,0x1F91F],[0x1F932,0x1F93F],[0x1F940,0x1F94F],
  [0x1F950,0x1F97F],[0x1F980,0x1F9AF],[0x1F330,0x1F37F],[0x1F380,0x1F3FF],
  [0x1F468,0x1F47F],[0x1F480,0x1F48F],[0x1F500,0x1F5FF],[0x1F540,0x1F55F],
  [0x1F560,0x1F57F],[0x1F580,0x1F59F],[0x1F5A0,0x1F5FF],[0x1F3FB,0x1F3FF],
];

function isStandardEmoji(cp) {
  for (const r of STANDARD_EMOJI_RANGES) {
    if (cp >= r[0] && cp <= r[1]) return true;
  }
  return false;
}

// ── Parse INI ──
function parseIni(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf-8');
  const entries = [];
  let current = null;
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (/^\[\d+\]$/.test(t)) {
      if (current) entries.push(current);
      current = {};
    } else if (current && t.includes('=')) {
      const eq = t.indexOf('=');
      const k = t.substring(0, eq).trim().toLowerCase();
      const v = t.substring(eq + 1).trim();
      current[k] = v;
    }
  }
  if (current) entries.push(current);
  return entries;
}

function findIniFile(dir) {
  const files = fs.readdirSync(dir);
  for (const f of ['emoji.ini','emoji_shuxue.ini','emoji_fuhao.ini','emoji_hot.ini']) {
    if (files.includes(f)) return path.join(dir, f);
  }
  for (const f of files) {
    if (f.startsWith('emoji_') && f.endsWith('.ini')) return path.join(dir, f);
  }
  return null;
}

// ── Collapse sorted CPs into ranges ──
function toRanges(cps) {
  cps.sort((a,b)=>a-b);
  const ranges = [];
  let s = null, e = null;
  for (const cp of cps) {
    if (s === null) { s = cp; e = cp; }
    else if (cp === e + 1) { e = cp; }
    else { ranges.push([s, e]); s = cp; e = cp; }
  }
  if (s !== null) ranges.push([s, e]);
  return ranges;
}

// ═══ Main ═══
const folderNameToId = {};
for (const fm of FOLDER_MAP) folderNameToId[fm.id] = fm;

const byFolder = {};    // folderId -> {cps:Set, names:Map, skins:Map}
const allIniCps = new Set();
const nameMap = {};
const skinMap = {};

// Parse all folders
const dirs = fs.readdirSync(EMOJI_DIR).sort();
for (const dn of dirs) {
  const dp = path.join(EMOJI_DIR, dn);
  if (!fs.statSync(dp).isDirectory()) continue;
  
// Match by folder Chinese name
const catId = FOLDER_TO_ID[dn];
  
  const iniPath = findIniFile(dp);
  if (!iniPath) { console.log('  ⚠ 无 INI:', dn); continue; }
  
  const entries = parseIni(iniPath);
  const data = { cps: new Set(), names: new Map(), skins: new Map() };
  
  for (const e of entries) {
    const raw = (e.title || e.code || '').toUpperCase();
    if (!raw) continue;
    // Take first hex component (for ZWJ sequences like "1F468,200D,1F4BB")
    const firstHex = raw.split(',')[0].trim();
    if (!/^[0-9A-F]+$/.test(firstHex)) continue;
    const cp = parseInt(firstHex, 16);
    data.cps.add(cp);
    allIniCps.add(cp);
    if (e.keyword) {
      data.names.set(firstHex, e.keyword);
      nameMap[firstHex] = e.keyword;
    }
    if ((e.supportskin||'0') === '1' && e.skincolor) {
      const variants = e.skincolor.split(',').map(s => s.trim()).filter(Boolean);
      if (variants.length > 0) data.skins.set(firstHex, variants);
      if (variants.length > 0) skinMap[firstHex] = variants;
    }
  }
  
  byFolder[catId] = data;
  console.log(`  ${dn} (→${catId}): ${data.cps.size} emoji, ${data.names.size} names, ${data.skins.size} skin`);
}

// ── Build misc: standard emoji NOT in any folder ──
console.log('\n--- 杂项: 计算遗漏 ---');
const miscCps = [];
for (const r of STANDARD_EMOJI_RANGES) {
  for (let cp = r[0]; cp <= r[1]; cp++) {
    if (!allIniCps.has(cp)) miscCps.push(cp);
  }
}
console.log(`  标准 Emoji 总范围覆盖: ~${allIniCps.size + miscCps.length} 码位`);
console.log(`  已分类: ${allIniCps.size}, 遗漏入杂项: ${miscCps.length}`);

// ── Generate emoji-data.js ──
function genEmojiJS() {
  // EMOJI_CATS
  const catLines = [];
  for (const fm of FOLDER_MAP) {
    const data = byFolder[fm.id];
    if (!data || data.cps.size === 0) continue;
    const cps = [...data.cps].sort((a,b)=>a-b);
    const ranges = toRanges(cps);
    const rs = ranges.map(r => `[0x${r[0].toString(16).toUpperCase()},0x${r[1].toString(16).toUpperCase()}]`).join(',');
    catLines.push(`  {id:'${fm.id}',label:'${fm.label}',ranges:[${rs}]}`);
  }
  // Misc
  if (miscCps.length > 0) {
    const ranges = toRanges(miscCps);
    const rs = ranges.map(r => `[0x${r[0].toString(16).toUpperCase()},0x${r[1].toString(16).toUpperCase()}]`).join(',');
    catLines.push(`  {id:'misc',label:'🎨 杂项',ranges:[${rs}]}`);
  }

  // EMOJI_NAMES
  const nameKeys = Object.keys(nameMap).sort((a,b) => parseInt(a,16)-parseInt(b,16));
  const nameStr = nameKeys.map(k => `'${k}':'${nameMap[k].replace(/'/g,"\\'")}'`).join(',');

  // EMOJI_SKIN
  const skinKeys = Object.keys(skinMap).sort((a,b) => parseInt(a,16)-parseInt(b,16));
  const skinStr = skinKeys.map(k => `'${k}':['${skinMap[k].join("','")}']`).join(',');

  // FLAG_COUNTRIES + EMOJI_PUA_RANGES (keep unchanged)
  return `// Emoji Data — auto-generated by build-data.js
var EMOJI_CATS=[${catLines.join(',\n')}];

var EMOJI_NAMES={${nameStr}};

var EMOJI_SKIN={${skinStr}};

var FLAG_COUNTRIES=[
  ['AD','Andorra'],['AE','UAE'],['AF','Afghanistan'],['AG','Antigua'],['AL','Albania'],['AM','Armenia'],
  ['AO','Angola'],['AR','Argentina'],['AT','Austria'],['AU','Australia'],['AZ','Azerbaijan'],
  ['BA','Bosnia'],['BB','Barbados'],['BD','Bangladesh'],['BE','Belgium'],['BF','Burkina Faso'],['BG','Bulgaria'],
  ['BH','Bahrain'],['BI','Burundi'],['BJ','Benin'],['BM','Bermuda'],['BN','Brunei'],['BO','Bolivia'],
  ['BR','Brazil'],['BS','Bahamas'],['BT','Bhutan'],['BW','Botswana'],['BY','Belarus'],['BZ','Belize'],
  ['CA','Canada'],['CD','Congo DR'],['CF','CAR'],['CG','Congo'],['CH','Switzerland'],['CI','Cote Ivoire'],
  ['CL','Chile'],['CM','Cameroon'],['CN','China'],['CO','Colombia'],['CR','Costa Rica'],['CU','Cuba'],
  ['CV','Cabo Verde'],['CY','Cyprus'],['CZ','Czechia'],['DE','Germany'],['DJ','Djibouti'],['DK','Denmark'],
  ['DM','Dominica'],['DO','Dominican Rep'],['DZ','Algeria'],['EC','Ecuador'],['EE','Estonia'],['EG','Egypt'],
  ['ES','Spain'],['ET','Ethiopia'],['FI','Finland'],['FJ','Fiji'],['FR','France'],
  ['GA','Gabon'],['GB','UK'],['GD','Grenada'],['GE','Georgia'],['GH','Ghana'],['GL','Greenland'],
  ['GM','Gambia'],['GN','Guinea'],['GQ','Equatorial'],['GR','Greece'],['GT','Guatemala'],
  ['HK','Hong Kong'],['HN','Honduras'],['HR','Croatia'],['HT','Haiti'],['HU','Hungary'],
  ['ID','Indonesia'],['IE','Ireland'],['IL','Israel'],['IN','India'],['IQ','Iraq'],['IR','Iran'],
  ['IS','Iceland'],['IT','Italy'],['JM','Jamaica'],['JO','Jordan'],['JP','Japan'],
  ['KE','Kenya'],['KG','Kyrgyzstan'],['KH','Cambodia'],['KI','Kiribati'],['KM','Comoros'],
  ['KN','St Kitts'],['KP','N Korea'],['KR','S Korea'],['KW','Kuwait'],['KZ','Kazakhstan'],
  ['LA','Laos'],['LB','Lebanon'],['LC','St Lucia'],['LI','Liechtenstein'],['LK','Sri Lanka'],['LR','Liberia'],
  ['LS','Lesotho'],['LT','Lithuania'],['LU','Luxembourg'],['LV','Latvia'],['LY','Libya'],
  ['MA','Morocco'],['MC','Monaco'],['MD','Moldova'],['ME','Montenegro'],['MG','Madagascar'],['MK','N Macedonia'],
  ['ML','Mali'],['MM','Myanmar'],['MN','Mongolia'],['MO','Macao'],['MR','Mauritania'],['MT','Malta'],
  ['MU','Mauritius'],['MV','Maldives'],['MW','Malawi'],['MX','Mexico'],['MY','Malaysia'],['MZ','Mozambique'],
  ['NA','Namibia'],['NE','Niger'],['NG','Nigeria'],['NI','Nicaragua'],['NL','Netherlands'],['NO','Norway'],
  ['NP','Nepal'],['NZ','New Zealand'],['OM','Oman'],
  ['PA','Panama'],['PE','Peru'],['PG','Papua NG'],['PH','Philippines'],['PK','Pakistan'],['PL','Poland'],
  ['PR','Puerto Rico'],['PS','Palestine'],['PT','Portugal'],['PW','Palau'],['PY','Paraguay'],['QA','Qatar'],
  ['RO','Romania'],['RS','Serbia'],['RU','Russia'],['RW','Rwanda'],
  ['SA','Saudi Arabia'],['SB','Solomon'],['SC','Seychelles'],['SD','Sudan'],['SE','Sweden'],
  ['SG','Singapore'],['SI','Slovenia'],['SK','Slovakia'],['SL','Sierra Leone'],['SM','San Marino'],
  ['SN','Senegal'],['SO','Somalia'],['SR','Suriname'],['SS','S Sudan'],['ST','Sao Tome'],
  ['SV','El Salvador'],['SY','Syria'],['SZ','Eswatini'],
  ['TD','Chad'],['TG','Togo'],['TH','Thailand'],['TJ','Tajikistan'],['TL','Timor-Leste'],
  ['TM','Turkmenistan'],['TN','Tunisia'],['TO','Tonga'],['TR','Turkey'],['TT','Trinidad'],
  ['TV','Tuvalu'],['TW','Taiwan'],['TZ','Tanzania'],
  ['UA','Ukraine'],['UG','Uganda'],['US','United States'],['UY','Uruguay'],['UZ','Uzbekistan'],
  ['VA','Vatican'],['VC','St Vincent'],['VE','Venezuela'],['VG','British VI'],['VN','Vietnam'],['VU','Vanuatu'],
  ['WS','Samoa'],['YE','Yemen'],['ZA','South Africa'],['ZM','Zambia'],['ZW','Zimbabwe']
];

var EMOJI_PUA_RANGES={
  zwj:{label:'零宽连字 ZWJ',start:0x200D,end:0x200D,desc:'Zero Width Joiner'},
  vs:{label:'异体选择符 VS',start:0xFE00,end:0xFE0F,desc:'Variation Selectors'},
  tags:{label:'标签 Tags',start:0xE0020,end:0xE007F,desc:'Tags'},
};
`;
}

const emojiJS = genEmojiJS();
fs.writeFileSync(path.join(OUTPUT_DIR, 'emoji-data.js'), emojiJS);
console.log(`\n✓ emoji-data.js (${emojiJS.length} bytes)`);
console.log(`  ${Object.keys(nameMap).length} 中文名, ${Object.keys(skinMap).length} 可变色`);
