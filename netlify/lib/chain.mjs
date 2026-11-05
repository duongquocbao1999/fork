// Solana for the launch functions: build the coin's transactions with pump.fun's own SDK, send them as one
// all-or-nothing Jito bundle, and read back what landed. The server holds no wallet: the launcher's wallet
// signs and pays; the only key here is the fresh mint keypair. It travels encrypted inside the short-lived
// send ticket and co-signs the create only after the wallet has signed exactly what was built (wallets
// want to sign first; anything they change breaks the check below).
//
//   tx A  (only if needed)  create pump.fun's GitHub fee accounts for recipients that don't have one yet
//   tx B  create_v2 (pump.fun) + create_fee_sharing_config — the coin, its creator vault moved to a split
//   tx C  update_fee_shares_v2 — the final split, which revokes the admin: it can never change again
//         + the Jito tip
// In a bundle they land together or not at all, so a coin never exists without its locked split.
//
// Env: SOLANA_RPC_URL (Helius or any mainnet RPC; secret), JITO_URL (optional block engine endpoint).
import { createHash, createPublicKey, verify as edVerify } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const web3 = require('@solana/web3.js');
const spl = require('@solana/spl-token');
const pump = require('@pump-fun/pump-sdk');
const { Keypair, PublicKey, SystemProgram, ComputeBudgetProgram, TransactionMessage, VersionedTransaction } = web3;

const JITO = () => (process.env.JITO_URL || 'https://mainnet.block-engine.jito.wtf').replace(/\/$/, '');
const TIP_ACCOUNTS = [ // Jito's published mainnet tip accounts; refreshed from getTipAccounts when it answers
  '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5', 'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
  'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY', 'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
  'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh', 'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
  'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL', '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT'
];
export const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const sha = b => createHash('sha256').update(b).digest('base64url');

/* ---------- JSON-RPC ---------- */
export async function rpc(method, params = [], ms = 8000) {
  const url = process.env.SOLANA_RPC_URL;
  if (!url) throw Object.assign(new Error('no_rpc'), { code: 'no_rpc' });
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(ms) });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.error) throw Object.assign(new Error(`rpc ${method}: ${r.status} ${j && j.error ? j.error.message : ''}`), { code: 'rpc' });
  return j.result;
}
const toInfo = v => v && { data: Buffer.from(v.data[0], 'base64'), owner: new PublicKey(v.owner), lamports: v.lamports, executable: v.executable };
export async function accounts(keys) {
  const res = await rpc('getMultipleAccounts', [keys.map(k => k.toBase58()), { encoding: 'base64', commitment: 'confirmed' }]);
  return res.value.map(toInfo);
}

/* ---------- the transactions ---------- */
export const githubPda = id => pump.socialFeePda(String(id), pump.Platform.GitHub);
export const holderKey = h => (h.kind === 'github' ? githubPda(h.id) : new PublicKey(h.address));

async function tipAccount() {
  try {
    const r = await fetch(`${JITO()}/api/v1/bundles`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTipAccounts', params: [] }), signal: AbortSignal.timeout(3000) });
    const j = await r.json();
    if (Array.isArray(j.result) && j.result.length) return new PublicKey(j.result[Math.floor(Math.random() * j.result.length)]);
  } catch (_) { }
  return new PublicKey(TIP_ACCOUNTS[Math.floor(Math.random() * TIP_ACCOUNTS.length)]);
}

/**
 * build({ wallet, name, symbol, uri, holders, tipSol }) →
 *   { mint, txs: [base64…], hashes: [sha256(message)…], missing: n }
 * holders: the plan's split; github ids become pump.fun GitHub fee accounts.
 */
export async function build({ wallet, name, symbol, uri, holders, tipSol }) {
  const user = new PublicKey(wallet), mint = Keypair.generate();
  const shareholders = holders.map(h => ({ address: holderKey(h), shareBps: h.bps }));
  const github = holders.filter(h => h.kind === 'github');
  const [{ blockhash }, infos] = await Promise.all([
    rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]).then(r => r.value),
    accounts(github.map(h => githubPda(h.id)))
  ]);
  const missing = github.filter((h, i) => !infos[i]);
  const cb = (units, price = 200000) => [ComputeBudgetProgram.setComputeUnitLimit({ units }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: price })];
  const compile = ixs => new VersionedTransaction(new TransactionMessage({ payerKey: user, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message());

  const txs = [];
  if (missing.length) {
    const ixs = cb(40000 + 25000 * missing.length);
    for (const h of missing) ixs.push(await pump.PUMP_SDK.createSocialFeePda({ payer: user, userId: String(h.id), platform: pump.Platform.GitHub }));
    txs.push(compile(ixs));
  }
  const create = compile([
    ...cb(400000),
    await pump.PUMP_SDK.createV2Instruction({ mint: mint.publicKey, name, symbol, uri, creator: user, user, mayhemMode: false }),
    await pump.PUMP_SDK.createFeeSharingConfig({ creator: user, mint: mint.publicKey, pool: null })
  ]);
  txs.push(create); // the mint co-signs at submit, after the wallet
  txs.push(compile([
    ...cb(300000),
    await pump.PUMP_SDK.updateFeeSharesV2({
      authority: user, mint: mint.publicKey, currentShareholders: [user], newShareholders: shareholders,
      quoteMint: spl.NATIVE_MINT, quoteTokenProgram: spl.TOKEN_PROGRAM_ID, bondingCurveComplete: false
    }),
    SystemProgram.transfer({ fromPubkey: user, toPubkey: await tipAccount(), lamports: Math.round(tipSol * 1e9) })
  ]));
  for (const t of txs) if (t.serialize().length > 1232) throw Object.assign(new Error('tx_too_large'), { code: 'tx_too_large' });
  return {
    mint: mint.publicKey.toBase58(),
    txs: txs.map(t => Buffer.from(t.serialize()).toString('base64')),
    hashes: txs.map(t => sha(t.message.serialize())),
    missing: missing.length,
    secret: Buffer.from(mint.secretKey)
  };
}

/* ---------- what comes back signed ---------- */
const SPKI = Buffer.from('302a300506032b6570032100', 'hex');
const edKey = raw => createPublicKey({ key: Buffer.concat([SPKI, Buffer.from(raw)]), format: 'der', type: 'spki' });

/** Each message exactly the one we built, and every signature but the mint's present and valid. */
export function checkSigned(b64s, hashes, wallet, mint) {
  if (!Array.isArray(b64s) || b64s.length !== hashes.length) return 'count';
  for (let i = 0; i < b64s.length; i++) {
    let tx;
    try { tx = VersionedTransaction.deserialize(Buffer.from(String(b64s[i]), 'base64')); } catch (_) { return 'decode'; }
    const msg = tx.message.serialize();
    if (sha(msg) !== hashes[i]) return 'changed';
    const keys = tx.message.staticAccountKeys;
    if (keys[0].toBase58() !== wallet) return 'payer';
    for (let s = 0; s < tx.message.header.numRequiredSignatures; s++) {
      if (mint && keys[s].toBase58() === mint) continue; // added by cosign()
      if (!edVerify(null, Buffer.from(msg), edKey(keys[s].toBytes()), Buffer.from(tx.signatures[s]))) return 'signature';
    }
  }
  return null;
}

/** The mint's signature on the transactions that need it (the create), after checkSigned passed. */
export function cosign(b64s, secret) {
  const kp = Keypair.fromSecretKey(Uint8Array.from(secret));
  return b64s.map(b => {
    const tx = VersionedTransaction.deserialize(Buffer.from(String(b), 'base64'));
    const n = tx.message.header.numRequiredSignatures;
    if (!tx.message.staticAccountKeys.slice(0, n).some(k => k.equals(kp.publicKey))) return String(b);
    tx.sign([kp]);
    return Buffer.from(tx.serialize()).toString('base64');
  });
}

/** One all-or-nothing bundle through Jito. Returns the bundle id. */
export async function sendBundle(b64s) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`${JITO()}/api/v1/bundles`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sendBundle', params: [b64s, { encoding: 'base64' }] }),
      signal: AbortSignal.timeout(6000)
    });
    const j = await r.json().catch(() => null);
    if (r.ok && j && j.result) return j.result;
    if (r.status === 429) { await new Promise(res => setTimeout(res, 700 * (attempt + 1))); continue; }
    throw Object.assign(new Error(`jito ${r.status} ${j && j.error ? j.error.message : ''}`), { code: 'jito' });
  }
  throw Object.assign(new Error('jito busy'), { code: 'jito_busy' });
}

/**
 * What landed for a mint: 'pending' (nothing yet), 'live' (the coin with exactly our split, locked),
 * or 'mismatch' (a coin, but not with our split).
 */
export async function landed(mintStr, holders) {
  const mint = new PublicKey(mintStr);
  const cfgKey = pump.feeSharingConfigPda(mint);
  const [curve, cfg] = await accounts([pump.bondingCurvePda(mint), cfgKey]);
  if (!curve) return { state: 'pending' };
  if (!cfg) return { state: 'mismatch', why: 'no split' };
  const sc = pump.PUMP_SDK.decodeSharingConfig(cfg), bc = pump.PUMP_SDK.decodeBondingCurve(curve);
  const want = holders.map(h => `${holderKey(h).toBase58()}:${h.bps}`).sort().join(',');
  const got = sc.shareholders.map(s => `${s.address.toBase58()}:${s.shareBps}`).sort().join(',');
  if (!bc.creator.equals(cfgKey)) return { state: 'mismatch', why: 'creator' };
  if (want !== got) return { state: 'mismatch', why: 'split' };
  if (!sc.adminRevoked) return { state: 'mismatch', why: 'unlocked' };
  return { state: 'live' };
}

/* ---------- metadata on pump.fun's IPFS ---------- */
export async function uploadMetadata({ name, symbol, description, website, twitter, image }) {
  const form = new FormData();
  form.append('file', new Blob([image.bytes], { type: image.type }), image.type === 'image/png' ? 'logo.png' : 'logo.jpg');
  form.append('name', name); form.append('symbol', symbol); form.append('description', description);
  form.append('website', website); if (twitter) form.append('twitter', twitter); form.append('showName', 'true');
  const r = await fetch(process.env.PUMP_IPFS_URL || 'https://pump.fun/api/ipfs', { method: 'POST', body: form, signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !j.metadataUri) throw Object.assign(new Error(`ipfs ${r.status}`), { code: 'ipfs' });
  return { uri: j.metadataUri, image: (j.metadata && j.metadata.image) || null };
}
