/**
 * 本地音乐处理流程
 *
 * 步骤 1: 解析元数据 + 提取内嵌封面/歌词 + 生成 music_list.js
 *   node generate-music.js
 *
 * 步骤 2: 上传到 R2（任选一种方式）
 *   方式 A — 使用本脚本（需配置以下环境变量）:
 *     export CLOUDFLARE_ACCOUNT_ID="xxx"
 *     export CLOUDFLARE_R2_ACCESS_KEY="xxx"
 *     export CLOUDFLARE_R2_SECRET_KEY="xxx"
 *     node upload-music.js
 *
 *   方式 B — 使用 rclone（推荐，简单可靠）:
 *     rclone config  # 选 S3 → Cloudflare R2
 *     rclone copy public/music/ r2-music:maxcloud/ --progress
 *     rclone copy scripts/music_list.js r2-music:maxcloud/scripts/
 *
 *   方式 C — 推送到 GitHub，由 Actions 自动部署
 *     git add scripts/music_list.js
 *     git commit -m "update music list"
 *     git push
 *
 * 步骤 3: GitHub Actions 自动部署到 Pages（无需手动操作）
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MUSIC_DIR = path.join(__dirname, '..', 'public', 'music');
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const ACCESS_KEY = process.env.CLOUDFLARE_R2_ACCESS_KEY;
const SECRET_KEY = process.env.CLOUDFLARE_R2_SECRET_KEY;
const BUCKET = 'maxcloud';

const S3_ENDPOINT = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;

function parseFileName(fileName) {
  const name = fileName.replace(/\.(mp3|flac|m4a|ogg|wav|aac)$/i, '');
  const match = name.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  return match ? { artist: match[1].trim(), title: match[2].trim() } : { artist: 'Unknown', title: name };
}

function hmac(k, str) { return crypto.createHmac('sha256', k).update(str).digest(); }

function signS3(method, key, contentLength, contentType, date) {
  const datestamp = date.slice(0, 8);
  const canonicalHeaders =
    `host:${ACCOUNT_ID}.r2.cloudflarestorage.com\n` +
    `x-amz-content-sha256:UNSIGNED-PAYLOAD\n` +
    `x-amz-date:${date}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest =
    `${method}\n/${BUCKET}/${key}\n\n${canonicalHeaders}\n${signedHeaders}\nUNSIGNED-PAYLOAD`;
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${datestamp}/auto/s3/aws4_request`;
  const stringToSign =
    `${algorithm}\n${date}\n${credentialScope}\n` +
    crypto.createHash('sha256').update(canonicalRequest).digest('hex');
  const kSigning = hmac(hmac(hmac(hmac('AWS4' + SECRET_KEY, datestamp), 'auto'), 's3'), 'aws4_request');
  return `${algorithm} Credential=${ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${hmac(kSigning, stringToSign).toString('hex')}`;
}

async function uploadToR2(key, filePath) {
  const ext = path.extname(key).toLowerCase();
  const mimeMap = {
    '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.m4a': 'audio/mp4',
    '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.aac': 'audio/aac',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.webp': 'image/webp', '.lrc': 'text/plain; charset=utf-8',
    '.js': 'application/javascript', '.json': 'application/json',
  };
  const contentType = mimeMap[ext] || 'application/octet-stream';
  const data = fs.readFileSync(filePath);
  const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const auth = signS3('PUT', key, data.length, contentType, date);

  const resp = await fetch(`${S3_ENDPOINT}/${BUCKET}/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: {
      'Authorization': auth, 'x-amz-date': date,
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
      'Content-Type': contentType, 'Content-Length': String(data.length),
    },
    body: data,
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  console.log(`  ✅ ${key}`);
}

async function main() {
  if (!ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY) {
    console.log('❌ 请设置环境变量:');
    console.log('   export CLOUDFLARE_ACCOUNT_ID="xxx"');
    console.log('   export CLOUDFLARE_R2_ACCESS_KEY="xxx"');
    console.log('   export CLOUDFLARE_R2_SECRET_KEY="xxx"');
    console.log('');
    console.log('💡 或者使用 rclone（更简单）:');
    console.log('   rclone copy public/music/ r2-music:maxcloud/ --progress');
    process.exit(1);
  }

  console.log('📤 上传到 R2...');
  if (!fs.existsSync(MUSIC_DIR)) {
    console.log('⚠️  public/music/ 目录不存在');
    process.exit(0);
  }

  const files = fs.readdirSync(MUSIC_DIR);
  const audioFiles = files.filter(f => /\.(mp3|flac|m4a|ogg|wav|aac)$/i.test(f));
  const coverFiles = files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
  const lrcFiles = files.filter(f => /\.(lrc|txt)$/i.test(f));
  let ok = true;

  for (const list of [audioFiles, coverFiles, lrcFiles]) {
    for (const file of list) {
      try {
        process.stdout.write(`  📤 ${file}... `);
        await uploadToR2(file, path.join(MUSIC_DIR, file));
      } catch (e) {
        console.error(`  ❌ ${file}: ${e.message}`);
        ok = false;
      }
    }
  }

  // 上传 music_list.js
  const musicListPath = path.join(__dirname, 'music_list.js');
  if (fs.existsSync(musicListPath)) {
    try {
      process.stdout.write(`  📤 scripts/music_list.js... `);
      await uploadToR2('scripts/music_list.js', musicListPath);
    } catch (e) {
      console.error(`  ❌ music_list.js: ${e.message}`);
      ok = false;
    }
  }

  console.log('');
  if (ok) {
    console.log('✅ 全部上传完成');
    console.log('💡 推送到 GitHub 触发 Pages 部署:');
    console.log('   git add scripts/music_list.js');
    console.log('   git commit -m "update music list"');
    console.log('   git push');
  } else {
    console.log('⚠️  部分文件上传失败');
    process.exit(1);
  }
}

main().catch(e => { console.error('❌', e); process.exit(1); });
