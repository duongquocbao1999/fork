// GET /api/ipfs/<cid> — a coin's logo from IPFS, served from forks.wiki. Public gateways are slow or down
// often enough that a logo straight from ipfs.io may never load; here several are asked at once, the first
// image wins, and the CDN keeps it for good (a CID never changes). Images only — PNG, JPEG, GIF, WebP — so
// nothing else can be served from this origin.
//
// Env (optional): PINATA_GATEWAY — your dedicated Pinata gateway host (e.g. something.mypinata.cloud), asked first.
const CID = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,100})$/;
const MAX = 3 * 1024 * 1024;
const kind = b => (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 ? 'image/png'
  : b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? 'image/jpeg'
  : b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 ? 'image/gif'
  : b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 ? 'image/webp' : null);

async function from(base, cid) {
  const r = await fetch(base + cid, { signal: AbortSignal.timeout(9000), headers: { accept: 'image/*' } });
  if (!r.ok) throw new Error(`${base} ${r.status}`);
  const len = Number(r.headers.get('content-length') || 0);
  if (len > MAX) throw new Error('too big');
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf.length > MAX || buf.length < 12) throw new Error('size');
  const type = kind(buf);
  if (!type) throw new Error('not an image');
  return { buf, type };
}

export default async req => {
  const cid = decodeURIComponent(new URL(req.url).pathname.split('/').pop() || '');
  if (!CID.test(cid)) return new Response('not a CID', { status: 400, headers: { 'cache-control': 'public, max-age=3600' } });
  const gws = [process.env.PINATA_GATEWAY && `https://${String(process.env.PINATA_GATEWAY).replace(/^https?:\/\//, '').replace(/\/.*$/, '')}/ipfs/`,
    'https://gateway.pinata.cloud/ipfs/', 'https://ipfs.io/ipfs/', 'https://dweb.link/ipfs/', 'https://w3s.link/ipfs/'].filter(Boolean);
  try {
    const { buf, type } = await Promise.any(gws.map(g => from(g, cid)));
    return new Response(buf, { status: 200, headers: {
      'content-type': type, 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'",
      'cache-control': 'public, max-age=31536000, immutable', 'netlify-cdn-cache-control': 'public, s-maxage=31536000, immutable'
    } });
  } catch (_) {
    // not found anywhere yet (a coin seconds old): try again in a minute, not never
    return new Response('not found on IPFS yet', { status: 404, headers: { 'cache-control': 'public, max-age=60', 'netlify-cdn-cache-control': 'public, s-maxage=60' } });
  }
};

export const config = { path: '/api/ipfs/*' };
