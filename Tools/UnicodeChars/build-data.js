/**
 * build-data.js — 从 /workspace/emoji/ 提取 Emoji 数据
 * 输出: emoji-data.js (中文名/可变色) + unicode-data.js (符号区块)
 * 
 * 策略:
 * - EMOJI_CATS 使用标准完整范围（不漏缺标准 Emoji）
 * - EMOJI_NAMES 优先中文名（来自 ini），英文名作兜底
 * - EMOJI_SKIN 来自 ini 的 supportSkin 字段
 */
const fs = require('fs');
const path = require('path');

const EMOJI_DIR = '/workspace/emoji';
const OUTPUT_DIR = '/workspace/maxcloud/Tools/UnicodeChars';

// ── 标准完整 EMOJI_CATS 范围（与之前版本一致） ──
const STANDARD_CATS = [
  {id:'smileys',label:'😀 笑脸与人物',ranges:[
    [0x1F600,0x1F64F],[0x1F910,0x1F92F],[0x1F970,0x1F97A],[0x1F9D0,0x1F9D0],
    [0x1F440,0x1F487],[0x1F468,0x1F47F],[0x1F9B0,0x1F9BF],[0x1F9CC,0x1F9CF],
    [0x1F9D1,0x1F9DF],[0x1F3FB,0x1F3FF],
  ]},
  {id:'animals',label:'🐾 动物与自然',ranges:[
    [0x1F400,0x1F43F],[0x1F980,0x1F9AE],[0x1FAB0,0x1FABF],[0x1F330,0x1F33F],
    [0x1F340,0x1F343],[0x1F490,0x1F49F],[0x1F300,0x1F31F],[0x1F324,0x1F32C],
    [0x1F308,0x1F308],[0x1F30A,0x1F30A],[0x1F3D4,0x1F3DF],
  ]},
  {id:'food',label:'🍎 食物与饮料',ranges:[
    [0x1F344,0x1F37F],[0x1F950,0x1F96F],[0x1FAD0,0x1FADF],[0x1F32D,0x1F32F],[0x1F9C0,0x1F9CB],
  ]},
  {id:'activities',label:'⚽ 活动',ranges:[
    [0x1F396,0x1F3AF],[0x1F3B0,0x1F3BC],[0x1F3BD,0x1F3D3],[0x1F3F8,0x1F3FA],
    [0x1F380,0x1F38F],[0x1F93C,0x1F93F],[0x1F940,0x1F94F],[0x1FA00,0x1FA6F],
    [0x26BD,0x26BE],[0x26F3,0x26F3],[0x26F7,0x26F9],
  ]},
  {id:'travel',label:'🚗 旅行与地点',ranges:[
    [0x1F680,0x1F6C5],[0x1F6CB,0x1F6D7],[0x1F6DC,0x1F6FC],[0x1F3E0,0x1F3F0],
    [0x1F550,0x1F567],[0x231A,0x231B],[0x23F0,0x23F3],
    [0x26E9,0x26FA],[0x26FD,0x26FD],[0x26F0,0x26F2],[0x26F4,0x26F6],[0x1F5FA,0x1F5FF],
  ]},
  {id:'objects',label:'💡 物品',ranges:[
    [0x1F4A0,0x1F4FF],[0x1F6AA,0x1F6BF],[0x1F6CE,0x1F6D2],[0x1F6E0,0x1F6E5],
    [0x1F451,0x1F45F],[0x1F48C,0x1F48F],[0x1F97B,0x1F97F],
    [0x1F9E0,0x1F9FF],[0x1FA70,0x1FAFF],[0x1F3F5,0x1F3F7],
  ]},
  {id:'symbols',label:'🔣 符号',ranges:[
    [0x2600,0x26FF],[0x2700,0x27BF],[0x2934,0x2935],[0x2B05,0x2B55],
    [0x3030,0x303D],[0x3297,0x3299],[0x23E9,0x23EF],[0x23F8,0x23FA],
    [0x24C2,0x24C2],[0x25AA,0x25FE],[0x23CF,0x23CF],
    [0x1F500,0x1F53F],[0x1F540,0x1F55F],
  ]},
  {id:'flags',label:'🏁 旗帜',flagsOnly:true},
  {id:'misc',label:'🎨 杂项',ranges:[
    [0x1F300,0x1F30F],[0x1F320,0x1F323],[0x1F390,0x1F395],
    [0x1F580,0x1F59F],[0x1F5A0,0x1F5FF],[0x1F900,0x1F90F],
    [0x1F930,0x1F933],[0x1F938,0x1F93B],[0x1FA80,0x1FAFF],[0x1F6F0,0x1F6F3],
  ]},
];

// ═══════════════════════════════════════════
//  Parse INI
// ═══════════════════════════════════════════

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

// ═══════════════════════════════════════════
//  Main
// ═══════════════════════════════════════════
const nameMap = {};    // hex -> Chinese keyword
const skinMap = {};    // hex -> skin variant strings
let totalIni = 0;

const dirs = fs.readdirSync(EMOJI_DIR).sort();
for (const dn of dirs) {
  const dp = path.join(EMOJI_DIR, dn);
  if (!fs.statSync(dp).isDirectory()) continue;
  const iniPath = findIniFile(dp);
  if (!iniPath) continue;
  const entries = parseIni(iniPath);
  for (const e of entries) {
    const hex = (e.title || e.code || '').toUpperCase();
    if (!hex || !/^[0-9A-F]+$/.test(hex)) continue;
    totalIni++;
    if (e.keyword) nameMap[hex] = e.keyword;
    if ((e.supportskin||'0') === '1' && e.skincolor) {
      skinMap[hex] = e.skincolor.split(',').map(s => s.trim()).filter(Boolean);
    }
  }
}

console.log('INI parsed:', totalIni, 'entries,', Object.keys(nameMap).length, 'Chinese names,', Object.keys(skinMap).length, 'skin-toned');

// ── Write emoji-data.js ──
function genEmojiJS() {
  // EMOJI_CATS
  const catLines = STANDARD_CATS.map(c => {
    if (c.flagsOnly) return `  {id:'${c.id}',label:'${c.label}',flagsOnly:true}`;
    const rs = c.ranges.map(r => `[0x${r[0].toString(16).toUpperCase()},0x${r[1].toString(16).toUpperCase()}]`).join(',');
    return `  {id:'${c.id}',label:'${c.label}',ranges:[${rs}]}`;
  });
  const catStr = catLines.join(',\n');

  // EMOJI_NAMES
  const nameKeys = Object.keys(nameMap).sort((a,b) => parseInt(a,16)-parseInt(b,16));
  const nameStr = nameKeys.map(k => `'${k}':'${nameMap[k].replace(/'/g,"\\'")}'`).join(',');

  // EMOJI_SKIN
  const skinKeys = Object.keys(skinMap).sort((a,b) => parseInt(a,16)-parseInt(b,16));
  const skinStr = skinKeys.map(k => `'${k}':['${skinMap[k].join("','")}']`).join(',');

  return `// Emoji Data — auto-generated by build-data.js
var EMOJI_CATS=[${catStr}];

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
console.log('✓ emoji-data.js (' + emojiJS.length + ' bytes)');

// ── Write unicode-data.js ──
const unicodeJS = `// Unicode Symbol Data — auto-generated
var PUBLIC_BLOCKS=[
  {id:'arrows',label:'箭头 Arrows',start:0x2190,end:0x21FF,desc:'标准箭头'},
  {id:'letterlike',label:'类字母 Letterlike',start:0x2100,end:0x214F,desc:'类字母符号'},
  {id:'number',label:'数字 Number Forms',start:0x2150,end:0x218F,desc:'数字形式'},
  {id:'math',label:'数学 Math Operators',start:0x2200,end:0x22FF,desc:'数学运算符'},
  {id:'tech',label:'技术 Misc Technical',start:0x2300,end:0x23FF,desc:'技术符号'},
  {id:'enclosed',label:'带圈 Enclosed',start:0x2460,end:0x24FF,desc:'带圈字母数字'},
  {id:'boxdraw',label:'制表 Box Drawing',start:0x2500,end:0x257F,desc:'制表符'},
  {id:'blocks',label:'方块 Block Elements',start:0x2580,end:0x259F,desc:'方块元素'},
  {id:'shapes',label:'几何 Geometric',start:0x25A0,end:0x25FF,desc:'几何形状'},
  {id:'misc',label:'杂项 Misc Symbols',start:0x2600,end:0x26FF,desc:'杂项符号'},
  {id:'dingbats',label:'装饰 Dingbats',start:0x2700,end:0x27BF,desc:'装饰符号'},
  {id:'suparrows',label:'补箭头 Suppl Arrows',start:0x27F0,end:0x27FF,desc:'补充箭头A'},
  {id:'suparrowsb',label:'补箭头B Suppl ArrowsB',start:0x2900,end:0x297F,desc:'补充箭头B'},
  {id:'braille',label:'盲文 Braille',start:0x2800,end:0x28FF,desc:'盲文'},
  {id:'supmath',label:'补数学 Suppl Math',start:0x2A00,end:0x2AFF,desc:'补充数学'},
  {id:'miscarrows',label:'杂箭头 Misc Arrows',start:0x2B00,end:0x2BFF,desc:'杂项箭头'},
  {id:'cjk',label:'CJK 符号标点',start:0x3000,end:0x303F,desc:'CJK符号'},
  {id:'yijing',label:'易经 Yijing',start:0x4DC0,end:0x4DFF,desc:'易经'},
  {id:'domino',label:'多米诺 Domino',start:0x1F030,end:0x1F09F,desc:'多米诺骨牌'},
  {id:'cards',label:'扑克 Playing Cards',start:0x1F0A0,end:0x1F0FF,desc:'扑克牌'},
  {id:'cansyl',label:'加拿大原住民音节',start:0x1400,end:0x167F,desc:'统一加拿大原住民音节'},
  {id:'bamum',label:'巴姆补充 Bamum Suppl',start:0x16800,end:0x16A3F,desc:'巴姆文补充'},
  {id:'egypt',label:'埃及象形 Egyptian',start:0x13000,end:0x1342F,desc:'埃及象形文字'},
];

var PUA_RANGES={
  bmp:{label:'BMP PUA',start:0xE000,end:0xF8FF,desc:'BMP 私人使用区 · 6400 个码位'},
  supa:{label:'Supp PUA-A',start:0xF0000,end:0xFFFFD,desc:'补充私人使用区-A · 65534 个码位'},
  supb:{label:'Supp PUA-B',start:0x100000,end:0x10FFFD,desc:'补充私人使用区-B · 65534 个码位'},
};
`;
fs.writeFileSync(path.join(OUTPUT_DIR, 'unicode-data.js'), unicodeJS);
console.log('✓ unicode-data.js (' + unicodeJS.length + ' bytes)');
