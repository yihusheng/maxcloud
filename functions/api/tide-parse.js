/**
 * Cloudflare Worker: 解析潮汐 (tide.fm) 分享链接
 * POST { "url": "https://tide.fm/zh_CN/share/sleep-stories/6346ca8a3a33ae00017fc851" }
 * 返回 { title, cover, audio }
 */
export async function onRequestPost(context) {
  const { request } = context;

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const body = await request.json();
    const { url } = body;

    if (!url || !url.includes('tide.fm')) {
      return new Response(JSON.stringify({ error: '请提供有效的潮汐链接' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
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
      return new Response(JSON.stringify({ error: '潮汐页面获取失败: ' + pageResp.status }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const html = await pageResp.text();

    // Extract title from og:title meta tag
    let title = '';
    const ogTitleMatch = html.match(/<meta\s+[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
    if (ogTitleMatch) {
      title = ogTitleMatch[1].replace(/\s*\|\s*潮汐.*$/, '').trim();
    }

    // Fallback: extract from <h2 class="title">
    if (!title) {
      const h2Match = html.match(/<h2[^>]*class=["'][^"']*title[^"']*["'][^>]*>([^<]+)<\/h2>/i);
      if (h2Match) title = h2Match[1].trim();
    }

    // Extract cover image from og:image
    let cover = '';
    const ogImageMatch = html.match(/<meta\s+[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (ogImageMatch) {
      // Remove imageView2 params to get original high-res image
      cover = ogImageMatch[1].replace(/\?imageView2.*$/, '').trim();
    }

    // Extract audio URL from <audio> tag
    let audio = '';
    const audioMatch = html.match(/<audio[^>]*src=["']([^"']+)["']/i);
    if (audioMatch) {
      audio = audioMatch[1];
    }

    if (!audio) {
      return new Response(JSON.stringify({ error: '未找到音频文件，该链接可能需要会员权限' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({ title, cover, audio }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: '解析失败: ' + err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

// Handle CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
