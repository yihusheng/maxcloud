/**
 * Cloudflare Pages Function — KGM 密钥段获取
 *
 * GET /api/decrypt-key?slots=0&count=655360
 *   slots: 起始槽位
 *   count: 需要多少个槽位的密钥
 *   Returns: 原始密钥字节 (binary)
 *
 * 浏览器端获取密钥段后本地解密，不上传文件。
 */

export async function onRequest(context) {
  const { request, env } = context;

  // CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url = new URL(request.url);
  const slots = parseInt(url.searchParams.get('slots') || '0', 10);
  const count = parseInt(url.searchParams.get('count') || '1024', 10);

  if (!env.MUSIC_BUCKET) {
    return new Response('R2 not configured', { status: 500 });
  }

  const offset = slots;
  const length = Math.min(count, 73155904 - offset);

  if (length <= 0) {
    return new Response('Invalid range', { status: 400 });
  }

  try {
    const obj = await env.MUSIC_BUCKET.get('kugou_key.bin', {
      range: { offset, length },
    });

    if (!obj) {
      return new Response('Key not found', { status: 500 });
    }

    const blob = await obj.blob();

    return new Response(blob, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(blob.size),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    console.error('[decrypt-key]', err);
    return new Response(err.message, { status: 500 });
  }
}
