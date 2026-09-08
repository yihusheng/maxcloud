/**
 * Cloudflare Worker: 解析潮汐 (tide.fm) 分享链接
 *
 * POST { "url": "https://tide.fm/zh_CN/share/sleep-stories/6346ca8a3a33ae00017fc851" }
 * → { title, cover, audio }
 *
 * GET  /api/tide-parse?proxy=<encodedAudioUrl>&type=audio
 * GET  /api/tide-parse?proxy=<encodedCoverUrl>&type=cover
 * → 代理转发音频/封面资源（绕过浏览器 CORS）
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestPost(context) {
  const { request } = context;
  try {
    const body = await request.json();
    const { url } = body;

    if (!url || !url.includes('tide.fm')) {
      return jsonResp({ error: '请提供有效的潮汐链接' }, 400);
    }

    // Fetch the page HTML
    const pageResp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });

    if (!pageResp.ok) {
      return jsonResp({ error: '潮汐页面获取失败: ' + pageResp.status }, 502);
    }

    const html = await pageResp.text();

    // Extract title from og:title
    let title = '';
    const ogTitleMatch = html.match(/<meta\s+[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
    if (ogTitleMatch) {
      title = ogTitleMatch[1].replace(/\s*\|\s*潮汐.*$/, '').trim();
    }
    if (!title) {
      const h2Match = html.match(/<h2[^>]*class=["'][^"']*title[^"']*["'][^>]*>([^<]+)<\/h2>/i);
      if (h2Match) title = h2Match[1].trim();
    }

    // Extract cover image from og:image
    let cover = '';
    const ogImageMatch = html.match(/<meta\s+[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (ogImageMatch) {
      cover = ogImageMatch[1].replace(/\?imageView2.*$/, '').trim();
    }

    // Extract audio URL from <audio> tag
    let audio = '';
    // Try multiple patterns for robustness
    const audioPatterns = [
      /<audio[^>]*\bsrc=["']([^"']+)["']/i,              // src="url"
      /<audio[^>]*\bsrc=\\?"([^"\\]+)\\?"/i,             // src=\"url\" (escaped)
      /<source[^>]*\bsrc=["']([^"']+)["'][^>]*type=["']audio/i, // source with type
      /["'](https?:\/\/[^"']*resources\.tide\.moreless\.io[^"']+)["']/i, // fallback: any tide resource URL
    ];
    for (const pat of audioPatterns) {
      const m = html.match(pat);
      if (m) { audio = m[1]; break; }
    }
    // Decode HTML entities in URL
    if (audio) {
      audio = audio.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
      // Ensure URL is absolute
      if (audio.startsWith('//')) audio = 'https:' + audio;
      else if (!audio.startsWith('http')) audio = 'https://' + audio;
    }

    if (!audio) {
      return jsonResp({ error: '未找到音频文件，该链接可能需要会员权限' }, 404);
    }

    // Validate audio URL is from tide resources
    if (!audio.includes('resources.tide.moreless.io') && !audio.includes('tide.moreless.io')) {
      console.warn('[Tide] Unexpected audio URL domain:', audio);
    }

    return jsonResp({ title, cover, audio, debug: { htmlLen: html.length } });

  } catch (err) {
    return jsonResp({ error: '解析失败: ' + err.message }, 500);
  }
}

// GET proxy: forward audio/cover requests to bypass browser CORS
export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);

  // Proxy mode: ?proxy=<url>&type=audio|cover
  const proxyUrl = url.searchParams.get('proxy');
  if (proxyUrl) {
    try {
      const decoded = decodeURIComponent(proxyUrl);
      const resp = await fetch(decoded, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': '*/*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Referer': 'https://tide.fm/',
        },
      });
      if (!resp.ok) {
        return new Response('Proxy fetch failed: ' + resp.status, { status: 502 });
      }
      // Stream the response back
      const contentType = resp.headers.get('content-type') || 'application/octet-stream';
      const headers = {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      };
      const contentLength = resp.headers.get('content-length');
      if (contentLength) headers['Content-Length'] = contentLength;

      return new Response(resp.body, { status: 200, headers });
    } catch (err) {
      return new Response('Proxy error: ' + err.message, { status: 500 });
    }
  }

  return new Response('OK', { status: 200, headers: { 'Access-Control-Allow-Origin': '*' } });
}

// Handle CORS preflight
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
