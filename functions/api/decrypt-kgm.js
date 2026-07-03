/**
 * Cloudflare Pages Function — KGM 文件解密 API
 * 
 * POST /api/decrypt-kgm
 *   Body: multipart/form-data with "file" field (单个 .kgm / .kgm.flac 文件)
 *   Returns: 解密后的音频文件 (自动检测格式 .mp3 / .flac)
 * 
 * 说明:
 *   - 首次冷启时从 R2 (MUSIC_BUCKET) 拉取密钥表
 *   - 密钥表仅下载文件所需的字节段 (非完整 70MB)
 *   - 解密结果流式返回
 */

// ── KGM 常量 ──
const KGM_MAGIC = new Uint8Array([
  0x7c, 0xd5, 0x32, 0xeb, 0x86, 0x02, 0x7f, 0x4b,
  0xa8, 0xaf, 0xa6, 0x8e, 0x0f, 0xff, 0x99, 0x14,
  0x00, 0x04, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x00, 0x00,
]);

const HEADER_LEN = 1024;
const OWN_KEY_LEN = 17;
const KEY_SLOT_SIZE = 16;

// ── PUB_KEY_MEND (272 字节, 从 Rust 源码提取) ──
const PUB_KEY_MEND = new Uint8Array([
  0xB8, 0xD5, 0x3D, 0xB2, 0xE9, 0xAF, 0x78, 0x8C, 0x83, 0x33, 0x71, 0x51, 0x76, 0xA0,
  0xCD, 0x37, 0x2F, 0x3E, 0x35, 0x8D, 0xA9, 0xBE, 0x98, 0xB7, 0xE7, 0x8C, 0x22, 0xCE,
  0x5A, 0x61, 0xDF, 0x68, 0x69, 0x89, 0xFE, 0xA5, 0xB6, 0xDE, 0xA9, 0x77, 0xFC, 0xC8,
  0xBD, 0xBD, 0xE5, 0x6D, 0x3E, 0x5A, 0x36, 0xEF, 0x69, 0x4E, 0xBE, 0xE1, 0xE9, 0x66,
  0x1C, 0xF3, 0xD9, 0x02, 0xB6, 0xF2, 0x12, 0x9B, 0x44, 0xD0, 0x6F, 0xB9, 0x35, 0x89,
  0xB6, 0x46, 0x6D, 0x73, 0x82, 0x06, 0x69, 0xC1, 0xED, 0xD7, 0x85, 0xC2, 0x30, 0xDF,
  0xA2, 0x62, 0xBE, 0x79, 0x2D, 0x62, 0x62, 0x3D, 0x0D, 0x7E, 0xBE, 0x48, 0x89, 0x23,
  0x02, 0xA0, 0xE4, 0xD5, 0x75, 0x51, 0x32, 0x02, 0x53, 0xFD, 0x16, 0x3A, 0x21, 0x3B,
  0x16, 0x0F, 0xC3, 0xB2, 0xBB, 0xB3, 0xE2, 0xBA, 0x3A, 0x3D, 0x13, 0xEC, 0xF6, 0x01,
  0x45, 0x84, 0xA5, 0x70, 0x0F, 0x93, 0x49, 0x0C, 0x64, 0xCD, 0x31, 0xD5, 0xCC, 0x4C,
  0x07, 0x01, 0x9E, 0x00, 0x1A, 0x23, 0x90, 0xBF, 0x88, 0x1E, 0x3B, 0xAB, 0xA6, 0x3E,
  0xC4, 0x73, 0x47, 0x10, 0x7E, 0x3B, 0x5E, 0xBC, 0xE3, 0x00, 0x84, 0xFF, 0x09, 0xD4,
  0xE0, 0x89, 0x0F, 0x5B, 0x58, 0x70, 0x4F, 0xFB, 0x65, 0xD8, 0x5C, 0x53, 0x1B, 0xD3,
  0xC8, 0xC6, 0xBF, 0xEF, 0x98, 0xB0, 0x50, 0x4F, 0x0F, 0xEA, 0xE5, 0x83, 0x58, 0x8C,
  0x28, 0x2C, 0x84, 0x67, 0xCD, 0xD0, 0x9E, 0x47, 0xDB, 0x27, 0x50, 0xCA, 0xF4, 0x63,
  0x63, 0xE8, 0x97, 0x7F, 0x1B, 0x4B, 0x0C, 0xC2, 0xC1, 0x21, 0x4C, 0xCC, 0x58, 0xF5,
  0x94, 0x52, 0xA3, 0xF3, 0xD3, 0xE0, 0x68, 0xF4, 0x00, 0x23, 0xF3, 0x5E, 0x0A, 0x7B,
  0x93, 0xDD, 0xAB, 0x12, 0xB2, 0x13, 0xE8, 0x84, 0xD7, 0xA7, 0x9F, 0x0F, 0x32, 0x4C,
  0x55, 0x1D, 0x04, 0x36, 0x52, 0xDC, 0x03, 0xF3, 0xF9, 0x4E, 0x42, 0xE9, 0x3D, 0x61,
  0xEF, 0x7C, 0xB6, 0xB3, 0x93, 0x50,
]);

// ── 格式检测 ──
function detectFormat(head) {
  if (head[0] === 0xFF && (head[1] & 0xE0) === 0xE0) return { ext: 'mp3', mime: 'audio/mpeg' };
  if (head[0] === 0x66 && head[1] === 0x4C && head[2] === 0x61 && head[3] === 0x43)
    return { ext: 'flac', mime: 'audio/flac' };
  if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33)
    return { ext: 'mp3', mime: 'audio/mpeg' };
  if (head[0] === 0x4F && head[1] === 0x67 && head[2] === 0x67 && head[3] === 0x53)
    return { ext: 'ogg', mime: 'audio/ogg' };
  if (head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46)
    return { ext: 'wav', mime: 'audio/wav' };
  return null;
}

// ── 名称清理 ──
function cleanFilename(name) {
  let base = name;
  for (const ext of ['.kgm.flac', '.kgm.mp3', '.kgma.flac', '.kgma', '.kgm']) {
    if (base.toLowerCase().endsWith(ext)) {
      base = base.slice(0, -ext.length);
      break;
    }
  }
  base = base.replace(/_(HQ|SQ|HiRes|HD|无损|高品质|标准|流畅)\s*$/i, '');
  base = base.replace(/\s*$$[^)]*$$\s*$/, '');
  return base.trim();
}

// ── 解密核心 ──
async function decryptKgm(input, keyTable) {
  const data = new Uint8Array(input);
  
  // 验证魔数
  for (let i = 0; i < 28; i++) {
    if (data[i] !== KGM_MAGIC[i]) throw new Error('Invalid KGM file');
  }
  
  // 提取 own_key (16字节, 第17字节为0)
  const ownKey = new Uint8Array(OWN_KEY_LEN);
  ownKey.set(data.subarray(0x1c, 0x2c));
  
  const offset = HEADER_LEN;
  const audioLen = data.length - offset;
  
  // 密钥表只需要文件对应的槽位范围
  const slotsNeeded = Math.ceil(audioLen / KEY_SLOT_SIZE);
  
  // 构建输出
  const output = new Uint8Array(audioLen);
  const mendLen = PUB_KEY_MEND.length;
  
  for (let j = 0; j < audioLen; j++) {
    const i = j;  // 绝对位置 (从音频数据起点算起)
    const enc = data[offset + j];
    
    // own_key 部分
    let ok = ownKey[i % OWN_KEY_LEN] ^ enc;
    ok = (ok ^ ((ok & 0x0f) << 4)) & 0xff;
    
    // pub_key 部分
    const slot = Math.floor(i / KEY_SLOT_SIZE);
    let pk = PUB_KEY_MEND[i % mendLen] ^ keyTable[slot];
    pk = (pk ^ ((pk & 0x0f) << 4)) & 0xff;
    
    output[j] = ok ^ pk;
  }
  
  return output;
}

// ── R2 密钥缓存 ──
const KEY_TABLE_KEY = 'kugou_key.bin';

// ── 请求处理 ──
export async function onRequest(context) {
  const { request, env } = context;
  
  // CORS 预检
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }
  
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  
  try {
    // 解析 multipart 上传
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return new Response('Expected multipart/form-data', { status: 400 });
    }
    
    const formData = await request.formData();
    const file = formData.get('file');
    
    if (!file) {
      return new Response('No file uploaded', { status: 400 });
    }
    const fileName = file.name || 'unknown.kgm.flac';
    const fileData = await file.arrayBuffer();
    if (fileData.byteLength <= HEADER_LEN) {
      return new Response('File too small', { status: 400 });
    }
    
    // 验证 KGM 头部
    const magicCheck = new Uint8Array(fileData, 0, 28);
    for (let i = 0; i < 28; i++) {
      if (magicCheck[i] !== KGM_MAGIC[i]) {
        return new Response('Not a valid KGM file', { status: 400 });
      }
    }
    
    const audioLen = fileData.byteLength - HEADER_LEN;
    const slotsNeeded = Math.ceil(audioLen / KEY_SLOT_SIZE);
    
    // 从 R2 获取密钥表 (只需文件对应的字节段)
    if (!env.MUSIC_BUCKET) {
      return new Response('R2 bucket not configured', { status: 500 });
    }
    
    const keyObj = await env.MUSIC_BUCKET.get(KEY_TABLE_KEY, {
      range: { offset: 0, length: slotsNeeded },
    });
    
    if (!keyObj) {
      return new Response('Key table not found in R2', { status: 500 });
    }
    
    const keyBuf = await keyObj.arrayBuffer();
    const keyTable = new Uint8Array(keyBuf);
    
    // 解密
    const decrypted = await decryptKgm(fileData, keyTable);
    
    // 检测格式
    const fmt = detectFormat(decrypted);
    const ext = fmt ? fmt.ext : 'bin';
    const mime = fmt ? fmt.mime : 'application/octet-stream';
    
    // 清理文件名
    const cleanName = cleanFilename(fileName);
    const downloadName = /\.\w+$/.test(cleanName)
      ? cleanName
      : cleanName + '.' + ext;
    
    return new Response(decrypted, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': mime,
        'Content-Disposition': `attachment; filename="${downloadName}"`,
        'Content-Length': String(decrypted.length),
        'X-Audio-Format': fmt ? fmt.ext : 'unknown',
      },
    });
  } catch (err) {
    console.error('[decrypt-kgm] error:', err);
    return new Response(err.message || 'Internal error', { status: 500 });
  }
}
