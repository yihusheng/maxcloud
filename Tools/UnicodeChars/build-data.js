/**
 * build-data.js — 从 /workspace/emoji/ 提取 Emoji 数据
 * 分类名 = 文件夹名（合并后），杂项兜底
 */
const fs = require('fs');
const path = require('path');
const EMOJI_DIR = '/workspace/emoji';
const OUTPUT_DIR = '/workspace/maxcloud/Tools/UnicodeChars';

// ── 分类定义（15 类，含合并） ──
const FOLDER_MAP = [
  { id:'smileys',     folder:'黄脸', label:'😀 黄脸' },
  { id:'gestures',    folder:'手势', label:'🤚 手势' },
  { id:'people',      folder:'人类', label:'🧑 人类' },   // ← 动作+家庭+职业 合并
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
  { id:'signs',       folder:'标志', label:'🔣 标志' },   // ← 标识+记号 合并
  { id:'math',        folder:'数学', label:'∑ 数学' },
];

// 20 个文件夹 → 15 个分类ID
const FOLDER_TO_ID = {
  '黄脸':'smileys','手势':'gestures',
  '动作':'people',  '家庭':'people',  '职业':'people',
  '动物':'animals', '植物':'plants',  '天气':'weather',
  '食物':'food',    '运动':'sports',
  '交通':'transport','景物':'scenery',
  '物品':'objects',  '服饰':'clothing',
  '心形':'hearts',
  '标志':'signs',   '标识':'signs',   '记号':'signs',
  '数学':'math',
};

// ── 标准 Emoji 码位 → 分类（用于杂项重新归类） ──
const RANGE_TO_CAT = [
  ['smileys',   0x1F600,0x1F64F], ['smileys',   0x1F910,0x1F92F],
  ['smileys',   0x1F970,0x1F97A], ['smileys',   0x1F9D0,0x1F9D0],
  ['people',    0x1F440,0x1F487], ['people',    0x1F468,0x1F47F],
  ['people',    0x1F9B0,0x1F9BF], ['people',    0x1F9CC,0x1F9CF],
  ['people',    0x1F9D1,0x1F9DF], ['people',    0x1F3FB,0x1F3FF],
  ['animals',   0x1F400,0x1F43F], ['animals',   0x1F980,0x1F9AE],
  ['animals',   0x1FAB0,0x1FABF], ['animals',   0x1FAC0,0x1FACF],
  ['plants',    0x1F330,0x1F33F], ['plants',    0x1F340,0x1F343],
  ['weather',   0x1F300,0x1F31F], ['weather',   0x1F324,0x1F32C],
  ['weather',   0x1F308,0x1F308], ['weather',   0x1F30A,0x1F30A],
  ['food',      0x1F344,0x1F37F], ['food',      0x1F950,0x1F96F],
  ['food',      0x1FAD0,0x1FADF], ['food',      0x1F32D,0x1F32F],
  ['food',      0x1F9C0,0x1F9CB],
  ['sports',    0x1F396,0x1F3D3], ['sports',    0x1F3F8,0x1F3FA],
  ['sports',    0x1F380,0x1F38F], ['sports',    0x1F93C,0x1F93F],
  ['sports',    0x1F940,0x1F94F], ['sports',    0x1FA00,0x1FA6F],
  ['sports',    0x26BD,0x26BE],   ['sports',    0x26F3,0x26F3],
  ['sports',    0x26F7,0x26F9],
  ['transport', 0x1F680,0x1F6C5], ['transport', 0x1F6CB,0x1F6D7],
  ['transport', 0x1F6DC,0x1F6FC], ['transport', 0x1F6F0,0x1F6F3],
  ['transport', 0x26FD,0x26FD],
  ['scenery',   0x1F3E0,0x1F3F0], ['scenery',   0x1F3D4,0x1F3DF],
  ['scenery',   0x1F5FA,0x1F5FF], ['scenery',   0x26E9,0x26FA],
  ['scenery',   0x26F0,0x26F2],   ['scenery',   0x26F4,0x26F6],
  ['scenery',   0x231A,0x231B],   ['scenery',   0x23F0,0x23F3],
  ['scenery',   0x1F550,0x1F567],
  ['objects',   0x1F4A0,0x1F4FF], ['objects',   0x1F6AA,0x1F6BF],
  ['objects',   0x1F6CE,0x1F6D2], ['objects',   0x1F6E0,0x1F6E5],
  ['objects',   0x1F451,0x1F45F], ['objects',   0x1F48C,0x1F48F],
  ['objects',   0x1F97B,0x1F97F], ['objects',   0x1F9E0,0x1F9FF],
  ['objects',   0x1FA70,0x1FAFF], ['objects',   0x1F3F5,0x1F3F7],
  ['hearts',    0x1F490,0x1F49F], ['hearts',    0x1F5A4,0x1F5A4],
  ['hearts',    0x1F90D,0x1F90E], ['hearts',    0x1FA75,0x1FA77],
  ['clothing',  0x1F460,0x1F467],
  ['signs',     0x2600,0x26FF],   ['signs',     0x2700,0x27BF],
  ['signs',     0x2934,0x2935],   ['signs',     0x2B05,0x2B55],
  ['signs',     0x3030,0x303D],   ['signs',     0x3297,0x3299],
  ['signs',     0x23E9,0x23EF],   ['signs',     0x23F8,0x23FA],
  ['signs',     0x24C2,0x24C2],   ['signs',     0x25AA,0x25FE],
  ['signs',     0x23CF,0x23CF],   ['signs',     0x1F500,0x1F53F],
  ['signs',     0x1F540,0x1F55F], ['signs',     0x1F560,0x1F57F],
  ['signs',     0x1F580,0x1F59F], ['signs',     0x1F5A0,0x1F5FF],
  ['signs',     0x1F900,0x1F90F], ['signs',     0x1F930,0x1F933],
  ['signs',     0x1F938,0x1F93B], ['signs',     0x1FA80,0x1FAFF],
];

// ── 标准 Emoji 检测范围 ──
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

// ── Parse INI ──
function parseIni(fp) {
  if (!fs.existsSync(fp)) return [];
  const entries = []; let cur = null;
  for (const l of fs.readFileSync(fp,'utf-8').split(/\r?\n/)) {
    const t = l.trim();
    if (/^\[\d+\]$/.test(t)) { if (cur) entries.push(cur); cur = {}; }
    else if (cur && t.includes('=')) {
      const eq = t.indexOf('=');
      cur[t.substring(0,eq).trim().toLowerCase()] = t.substring(eq+1).trim();
    }
  }
  if (cur) entries.push(cur);
  return entries;
}

function findIni(dir) {
  for (const f of ['emoji.ini','emoji_shuxue.ini','emoji_fuhao.ini','emoji_hot.ini'])
    if (fs.readdirSync(dir).includes(f)) return path.join(dir, f);
  for (const f of fs.readdirSync(dir))
    if (f.startsWith('emoji_') && f.endsWith('.ini')) return path.join(dir, f);
  return null;
}

// ── Collapse CPs → ranges ──
function toRanges(cps) {
  cps.sort((a,b)=>a-b); const r = []; let s=null,e=null;
  for (const cp of cps) {
    if (s===null) { s=cp; e=cp; }
    else if (cp===e+1) e=cp;
    else { r.push([s,e]); s=cp; e=cp; }
  }
  if (s!==null) r.push([s,e]);
  return r;
}

// ── 查找 CP 在 RANGE_TO_CAT 中 → 分类 ──
function findCatForCp(cp) {
  for (const [cat, s, e] of RANGE_TO_CAT) {
    if (cp >= s && cp <= e) return cat;
  }
  return null;
}

// ═══ Main ═══
const byFolder = {};       // folderId -> {cps:Set, names:Map, skins:Map}
const allIniCps = new Set();
const nameMap = {};
const skinMap = {};

for (const dn of fs.readdirSync(EMOJI_DIR).sort()) {
  const dp = path.join(EMOJI_DIR, dn);
  if (!fs.statSync(dp).isDirectory()) continue;
  const catId = FOLDER_TO_ID[dn];
  const iniPath = findIni(dp);
  if (!iniPath) { console.log('  ⚠ 无 INI:', dn); continue; }
  const entries = parseIni(iniPath);
  const data = { cps: new Set(), names: new Map(), skins: new Map() };
  for (const e of entries) {
    const raw = (e.title || e.code || '').toUpperCase();
    if (!raw) continue;
    const firstHex = raw.split(',')[0].trim();
    if (!/^[0-9A-F]+$/.test(firstHex)) continue;
    const cp = parseInt(firstHex, 16);
    data.cps.add(cp); allIniCps.add(cp);
    if (e.keyword) { data.names.set(firstHex, e.keyword); nameMap[firstHex] = e.keyword; }
    if ((e.supportskin||'0')==='1' && e.skincolor) {
      const v = e.skincolor.split(',').map(s=>s.trim()).filter(Boolean);
      if (v.length) { data.skins.set(firstHex, v); skinMap[firstHex] = v; }
    }
  }
  byFolder[catId] = data;
  console.log(`  ${dn} (→${catId}): ${data.cps.size} emoji`);
}

// ── 杂项重新归类 ──
console.log('\n--- 杂项重新归类 ---');
const reassign = {};   // catId -> Set<cp>
let trulyMiscCps = [];

for (const r of STANDARD_EMOJI_RANGES) {
  for (let cp = r[0]; cp <= r[1]; cp++) {
    if (allIniCps.has(cp)) continue;       // 已在文件夹中
    const cat = findCatForCp(cp);
    if (cat) {
      if (!reassign[cat]) reassign[cat] = [];
      reassign[cat].push(cp);
    } else {
      trulyMiscCps.push(cp);
    }
  }
}

// 将重新归类的 CP 合并回各分类
for (const [cat, cps] of Object.entries(reassign)) {
  if (!byFolder[cat]) byFolder[cat] = { cps: new Set(), names: new Map(), skins: new Map() };
  for (const cp of cps) byFolder[cat].cps.add(cp);
  console.log(`  → ${cat}: +${cps.length}`);
}
console.log(`  → 杂项: ${trulyMiscCps.length}`);

// ── 生成 emoji-data.js ──
function genEmojiJS() {
  const catLines = [];
  const allCatIds = ['smileys','gestures','people','animals','plants','weather','food','sports',
                     'transport','scenery','objects','clothing','hearts','signs','math'];
  for (const id of allCatIds) {
    const data = byFolder[id];
    if (!data || data.cps.size === 0) continue;
    const cps = [...data.cps].sort((a,b)=>a-b);
    const ranges = toRanges(cps);
    const rs = ranges.map(r => `[0x${r[0].toString(16).toUpperCase()},0x${r[1].toString(16).toUpperCase()}]`).join(',');
    catLines.push(`  {id:'${id}',label:'${FOLDER_MAP.find(f=>f.id===id).label}',ranges:[${rs}]}`);
  }
  if (trulyMiscCps.length > 0) {
    const ranges = toRanges(trulyMiscCps);
    const rs = ranges.map(r => `[0x${r[0].toString(16).toUpperCase()},0x${r[1].toString(16).toUpperCase()}]`).join(',');
    catLines.push(`  {id:'misc',label:'🎨 杂项',ranges:[${rs}]}`);
  }
  const nameKeys = Object.keys(nameMap).sort((a,b)=>parseInt(a,16)-parseInt(b,16));
  const nameStr = nameKeys.map(k=>`'${k}':'${nameMap[k].replace(/'/g,"\\'")}'`).join(',');
  const skinKeys = Object.keys(skinMap).sort((a,b)=>parseInt(a,16)-parseInt(b,16));
  const skinStr = skinKeys.map(k=>`'${k}':['${skinMap[k].join("','")}']`).join(',');

  return `// Emoji Data — auto-generated
var EMOJI_CATS=[${catLines.join(',\n')}];
var EMOJI_NAMES={${nameStr}};
var EMOJI_SKIN={${skinStr}};
var FLAG_COUNTRIES=[['AD','Andorra'],['AE','UAE'],['AF','Afghanistan'],['AG','Antigua'],['AL','Albania'],['AM','Armenia'],['AO','Angola'],['AR','Argentina'],['AT','Austria'],['AU','Australia'],['AZ','Azerbaijan'],['BA','Bosnia'],['BB','Barbados'],['BD','Bangladesh'],['BE','Belgium'],['BF','Burkina Faso'],['BG','Bulgaria'],['BH','Bahrain'],['BI','Burundi'],['BJ','Benin'],['BM','Bermuda'],['BN','Brunei'],['BO','Bolivia'],['BR','Brazil'],['BS','Bahamas'],['BT','Bhutan'],['BW','Botswana'],['BY','Belarus'],['BZ','Belize'],['CA','Canada'],['CD','Congo DR'],['CF','CAR'],['CG','Congo'],['CH','Switzerland'],['CI','Cote Ivoire'],['CL','Chile'],['CM','Cameroon'],['CN','China'],['CO','Colombia'],['CR','Costa Rica'],['CU','Cuba'],['CV','Cabo Verde'],['CY','Cyprus'],['CZ','Czechia'],['DE','Germany'],['DJ','Djibouti'],['DK','Denmark'],['DM','Dominica'],['DO','Dominican Rep'],['DZ','Algeria'],['EC','Ecuador'],['EE','Estonia'],['EG','Egypt'],['ES','Spain'],['ET','Ethiopia'],['FI','Finland'],['FJ','Fiji'],['FR','France'],['GA','Gabon'],['GB','UK'],['GD','Grenada'],['GE','Georgia'],['GH','Ghana'],['GL','Greenland'],['GM','Gambia'],['GN','Guinea'],['GQ','Equatorial'],['GR','Greece'],['GT','Guatemala'],['HK','Hong Kong'],['HN','Honduras'],['HR','Croatia'],['HT','Haiti'],['HU','Hungary'],['ID','Indonesia'],['IE','Ireland'],['IL','Israel'],['IN','India'],['IQ','Iraq'],['IR','Iran'],['IS','Iceland'],['IT','Italy'],['JM','Jamaica'],['JO','Jordan'],['JP','Japan'],['KE','Kenya'],['KG','Kyrgyzstan'],['KH','Cambodia'],['KI','Kiribati'],['KM','Comoros'],['KN','St Kitts'],['KP','N Korea'],['KR','S Korea'],['KW','Kuwait'],['KZ','Kazakhstan'],['LA','Laos'],['LB','Lebanon'],['LC','St Lucia'],['LI','Liechtenstein'],['LK','Sri Lanka'],['LR','Liberia'],['LS','Lesotho'],['LT','Lithuania'],['LU','Luxembourg'],['LV','Latvia'],['LY','Libya'],['MA','Morocco'],['MC','Monaco'],['MD','Moldova'],['ME','Montenegro'],['MG','Madagascar'],['MK','N Macedonia'],['ML','Mali'],['MM','Myanmar'],['MN','Mongolia'],['MO','Macao'],['MR','Mauritania'],['MT','Malta'],['MU','Mauritius'],['MV','Maldives'],['MW','Malawi'],['MX','Mexico'],['MY','Malaysia'],['MZ','Mozambique'],['NA','Namibia'],['NE','Niger'],['NG','Nigeria'],['NI','Nicaragua'],['NL','Netherlands'],['NO','Norway'],['NP','Nepal'],['NZ','New Zealand'],['OM','Oman'],['PA','Panama'],['PE','Peru'],['PG','Papua NG'],['PH','Philippines'],['PK','Pakistan'],['PL','Poland'],['PR','Puerto Rico'],['PS','Palestine'],['PT','Portugal'],['PW','Palau'],['PY','Paraguay'],['QA','Qatar'],['RO','Romania'],['RS','Serbia'],['RU','Russia'],['RW','Rwanda'],['SA','Saudi Arabia'],['SB','Solomon'],['SC','Seychelles'],['SD','Sudan'],['SE','Sweden'],['SG','Singapore'],['SI','Slovenia'],['SK','Slovakia'],['SL','Sierra Leone'],['SM','San Marino'],['SN','Senegal'],['SO','Somalia'],['SR','Suriname'],['SS','S Sudan'],['ST','Sao Tome'],['SV','El Salvador'],['SY','Syria'],['SZ','Eswatini'],['TD','Chad'],['TG','Togo'],['TH','Thailand'],['TJ','Tajikistan'],['TL','Timor-Leste'],['TM','Turkmenistan'],['TN','Tunisia'],['TO','Tonga'],['TR','Turkey'],['TT','Trinidad'],['TV','Tuvalu'],['TW','Taiwan'],['TZ','Tanzania'],['UA','Ukraine'],['UG','Uganda'],['US','United States'],['UY','Uruguay'],['UZ','Uzbekistan'],['VA','Vatican'],['VC','St Vincent'],['VE','Venezuela'],['VG','British VI'],['VN','Vietnam'],['VU','Vanuatu'],['WS','Samoa'],['YE','Yemen'],['ZA','South Africa'],['ZM','Zambia'],['ZW','Zimbabwe']];
var EMOJI_PUA_RANGES={zwj:{label:'零宽连字 ZWJ',start:0x200D,end:0x200D,desc:'Zero Width Joiner'},vs:{label:'异体选择符 VS',start:0xFE00,end:0xFE0F,desc:'Variation Selectors'},tags:{label:'标签 Tags',start:0xE0020,end:0xE007F,desc:'Tags'}};
`;
}

fs.writeFileSync(path.join(OUTPUT_DIR, 'emoji-data.js'), genEmojiJS());
console.log(`\n✓ emoji-data.js generated`);
