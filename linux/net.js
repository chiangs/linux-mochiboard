// Link previews (the page's title, description and og:image) and bringing remote pictures home as data.
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Mochiboard';

async function get(url, timeout, headers = {}) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeout * 1000);
  try { return await fetch(url, { signal: ctl.signal, headers, redirect: 'follow' }); } finally { clearTimeout(t); }
}

async function linkPreview(s) {
  let url; try { url = new URL(s); } catch (e) { return { title: s, desc: s, image: '' }; }
  let html = '';
  try { const r = await get(url, 10, { 'User-Agent': UA }); html = Buffer.from(await r.arrayBuffer()).subarray(0, 400000).toString('utf8'); } catch (e) {}
  const meta = keys => {
    for (const k of keys) {
      for (const pat of [`<meta[^>]+(?:property|name)=["']${k}["'][^>]+content=["']([^"']*)["']`, `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${k}["']`]) {
        const m = html.match(new RegExp(pat, 'i')); if (m) return m[1];
      }
    }
    return null;
  };
  let title = meta(['og:title', 'twitter:title']) || '';
  if (!title) { const m = html.match(/<title[^>]*>([^<]*)<\/title>/i); if (m) title = m[1]; }
  let image = meta(['og:image', 'twitter:image']) || '';
  if (image) { try { image = new URL(image, url).href; } catch (e) {} }
  const decode = x => x.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
  return { title: decode(title || url.host || s), desc: decode(meta(['og:description', 'description']) ?? (url.host || s)), image };
}

// pictures from Mobbin or Higgsfield come in as links; bring them home as data, so they're saved with the board
async function fetchImage(s) {
  try {
    const r = await get(new URL(s), 30), data = Buffer.from(await r.arrayBuffer());
    if (data.length <= 200) return null;
    const type = (r.headers.get('content-type') || 'image/jpeg').split(';')[0];
    return `data:${type};base64,${data.toString('base64')}`;
  } catch (e) { return null; }
}

module.exports = { linkPreview, fetchImage, get, UA };
