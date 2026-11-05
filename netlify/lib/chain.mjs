// Solana for the launch functions: build the coin's transactions with pump.fun's own SDK, send them as one
// all-or-nothing Jito bundle, and read back what landed. The server holds no wallet: the launcher's wallet
// signs and pays; the only key here is the fresh mint keypair. It travels encrypted inside the short-lived
// send ticket and co-signs the create only after the wallet has signed exactly what was built (wallets
// want to sign first; anything they change breaks the check below).
//
//   tx A  (only if needed)  create pump.fun's GitHub fee accounts for recipients that don't have one yet
//   tx B  create_v2 (pump.fun) + create_fee_sharing_config — the coin, its creator vault moved to a split
//   tx C  update_fee_shares_v2 — the final split, which revokes the admin: it can never change again
//   tx D  (only with "buy at launch") the launcher's first buy on the new curve
//   the last of them carries the Jito tip
// In a bundle they land together or not at all, so a coin never exists without its locked split.
//
// Env: SOLANA_RPC_URL (Helius or any mainnet RPC; secret), JITO_URL (optional block engine endpoint).
import { createHash, createPublicKey, verify as edVerify } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// The SDKs load defensively: if the host's Node can't load one (an old runtime, a dependency missing from the
// upload), the function still starts — prices, charts and coin lists keep working, and anything that needs
// the chain answers { error: 'sdk' } instead of taking the whole function down. GET /api/chain says why.
let LOAD_ERROR = null;
const sdkError = () => Object.assign(new Error('solana sdk unavailable: ' + (LOAD_ERROR ? LOAD_ERROR.message : '')), { code: 'sdk' });
const absent = () => new Proxy({}, { get(_, k) { if (typeof k === 'symbol' || k === 'then') return undefined; throw sdkError(); } });
// (each require keeps its literal name: Netlify's bundler finds the modules to upload by reading these calls)
function load(id, get) {
  try { return get(); }
  catch (e) { LOAD_ERROR = LOAD_ERROR || Object.assign(e, { module: id }); console.error('chain: cannot load', id, '-', e.code || '', e.message); return null; }
}
const web3 = load('@solana/web3.js', () => require('@solana/web3.js')) || absent();
const spl = load('@solana/spl-token', () => require('@solana/spl-token')) || absent();
const pump = load('@pump-fun/pump-sdk', () => require('@pump-fun/pump-sdk')) || absent();
const BN = load('bn.js', () => require('bn.js')) || absent();
const W = k => (LOAD_ERROR ? undefined : web3[k]);
const Keypair = W('Keypair'), PublicKey = W('PublicKey'), SystemProgram = W('SystemProgram'), ComputeBudgetProgram = W('ComputeBudgetProgram'), TransactionMessage = W('TransactionMessage'), VersionedTransaction = W('VersionedTransaction');
/** Did the Solana SDKs load? { ok, node, error, module } — for /api/chain and the health check. */
export const sdkStatus = () => ({ ok: !LOAD_ERROR, node: process.version, error: LOAD_ERROR ? String(LOAD_ERROR.code || '') + ' ' + String(LOAD_ERROR.message || '').split('\n')[0].slice(0, 300) : null, module: LOAD_ERROR ? LOAD_ERROR.module : null });
/** Throws { code: 'sdk' } when the SDKs didn't load. */
export const needSdk = () => { if (LOAD_ERROR) throw sdkError(); };

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
export const curveAddress = m => pump.bondingCurvePda(new PublicKey(m)).toBase58();
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
export async function build({ wallet, name, symbol, uri, holders, tipSol, devBuyLamports = 0 }) {
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
  const tip = SystemProgram.transfer({ fromPubkey: user, toPubkey: await tipAccount(), lamports: Math.round(tipSol * 1e9) });
  const update = await pump.PUMP_SDK.updateFeeSharesV2({
    authority: user, mint: mint.publicKey, currentShareholders: [user], newShareholders: shareholders,
    quoteMint: spl.NATIVE_MINT, quoteTokenProgram: spl.TOKEN_PROGRAM_ID, bondingCurveComplete: false
  });
  let bought = null;
  if (devBuyLamports > 0) {
    // the first buy, after the split is locked: the curve's creator is then the sharing config, so the buy's
    // creator vault is the config's, exactly as the program will check it
    txs.push(compile([...cb(300000), update]));
    const { global, feeConfig } = await pumpState();
    const sol = new BN(String(devBuyLamports));
    const fresh = { ...pump.newBondingCurve(global, spl.NATIVE_MINT), creator: pump.feeSharingConfigPda(mint.publicKey), isMayhemMode: false };
    const amount = pump.getBuyTokenAmountFromSolAmount({ global, feeConfig, mintSupply: null, bondingCurve: null, amount: sol, quoteMint: spl.NATIVE_MINT });
    const ixs = await pump.PUMP_SDK.buyInstructions({
      global, bondingCurveAccountInfo: null, bondingCurve: fresh, associatedUserAccountInfo: null,
      mint: mint.publicKey, user, amount, solAmount: sol, slippage: 1, tokenProgram: spl.TOKEN_2022_PROGRAM_ID
    });
    txs.push(compile([...cb(250000), ...ixs, tip]));
    bought = amount.toString();
  } else {
    txs.push(compile([...cb(300000), update, tip]));
  }
  for (const t of txs) if (t.serialize().length > 1232) throw Object.assign(new Error('tx_too_large'), { code: 'tx_too_large' });
  return {
    mint: mint.publicKey.toBase58(),
    txs: txs.map(t => Buffer.from(t.serialize()).toString('base64')),
    hashes: txs.map(t => sha(t.message.serialize())),
    missing: missing.length,
    bought,
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

/* ---------- pump.fun's own state: Global and the fee schedule (cached a minute) ---------- */
let stateCache = null;
export async function pumpState() {
  if (stateCache && Date.now() - stateCache.at < 60e3) return stateCache.v;
  const [g, f] = await accounts([pump.GLOBAL_PDA, pump.PUMP_FEE_CONFIG_PDA]);
  if (!g) throw Object.assign(new Error('no pump global'), { code: 'rpc' });
  const v = { global: pump.PUMP_SDK.decodeGlobal(g), feeConfig: f ? pump.PUMP_SDK.decodeFeeConfig(f) : null };
  stateCache = { at: Date.now(), v };
  return v;
}

/* ---------- a mint and its curve, as the terminal needs them ---------- */
const WSOL = 'So11111111111111111111111111111111111111112'; // spl.NATIVE_MINT
/** { decimals, supply (raw string), program ('spl'|'token-2022'), curve: null | { complete, solCurve, progress, ... } } */
export async function coinState(mintStr) {
  const mint = new PublicKey(mintStr);
  const [m, bc] = await accounts([mint, pump.bondingCurvePda(mint)]);
  if (!m) return null;
  const program = m.owner.equals(spl.TOKEN_2022_PROGRAM_ID) ? 'token-2022' : m.owner.equals(spl.TOKEN_PROGRAM_ID) ? 'spl' : null;
  if (!program) return null;
  const decimals = m.data[44], supply = m.data.readBigUInt64LE(36).toString(); // SPL mint layout (Token-2022 shares it)
  let curve = null;
  if (bc && bc.owner.equals(pump.PUMP_PROGRAM_ID)) {
    const c = pump.PUMP_SDK.decodeBondingCurve(bc);
    const solCurve = c.quoteMint.equals(PublicKey.default) || c.quoteMint.equals(spl.NATIVE_MINT);
    let progress = null;
    try {
      const { global } = await pumpState();
      const init = BigInt(global.initialRealTokenReserves.toString()), left = BigInt(c.realTokenReserves.toString());
      progress = c.complete ? 100 : init > 0n ? Math.max(0, Math.min(100, Number((init - left) * 10000n / init) / 100)) : null;
    } catch (_) { }
    curve = {
      complete: !!c.complete, solCurve, progress,
      virtualSol: c.virtualQuoteReserves.toString(), virtualToken: c.virtualTokenReserves.toString(),
      realSol: c.realQuoteReserves.toString(), creator: c.creator.toBase58(),
      mcapLamports: pump.bondingCurveMarketCap({ mintSupply: c.tokenTotalSupply, virtualQuoteReserves: c.virtualQuoteReserves, virtualTokenReserves: c.virtualTokenReserves }).toString()
    };
  }
  return { decimals, supply, program, curve };
}

/** Curve progress for many mints in one call: { mint: { complete, progress, mcapLamports } | null }. */
export async function curvesOf(mints) {
  if (!mints.length) return {};
  const infos = await accounts(mints.map(m => pump.bondingCurvePda(new PublicKey(m))));
  let init = null;
  try { init = BigInt((await pumpState()).global.initialRealTokenReserves.toString()); } catch (_) { }
  const out = {};
  mints.forEach((m, i) => {
    const bc = infos[i];
    if (!bc || !bc.owner.equals(pump.PUMP_PROGRAM_ID)) { out[m] = null; return; }
    const c = pump.PUMP_SDK.decodeBondingCurve(bc), left = BigInt(c.realTokenReserves.toString());
    out[m] = {
      complete: !!c.complete,
      progress: c.complete ? 100 : init ? Math.max(0, Math.min(100, Number((init - left) * 10000n / init) / 100)) : null,
      mcapLamports: pump.bondingCurveMarketCap({ mintSupply: c.tokenTotalSupply, virtualQuoteReserves: c.virtualQuoteReserves, virtualTokenReserves: c.virtualTokenReserves }).toString()
    };
  });
  return out;
}

/** A trade straight on a live SOL curve: quote only (no user) or the transaction to sign. */
export async function curveTrade({ mint: mintStr, side, amount, slippageBps, user: userStr }) {
  const mint = new PublicKey(mintStr);
  const [m, bcInfo] = await accounts([mint, pump.bondingCurvePda(mint)]);
  if (!m || !bcInfo) return null;
  const bc = pump.PUMP_SDK.decodeBondingCurve(bcInfo);
  const solCurve = bc.quoteMint.equals(PublicKey.default) || bc.quoteMint.equals(spl.NATIVE_MINT);
  if (bc.complete || !solCurve) return null;
  const tokenProgram = m.owner;
  const { global, feeConfig } = await pumpState();
  const amt = new BN(String(amount)), slip = Math.max(0.1, Number(slippageBps || 500) / 100);
  let out;
  if (side === 'buy') out = pump.getBuyTokenAmountFromSolAmount({ global, feeConfig, mintSupply: bc.tokenTotalSupply, bondingCurve: bc, amount: amt, quoteMint: spl.NATIVE_MINT });
  else out = pump.getSellSolAmountFromTokenAmount({ global, feeConfig, mintSupply: bc.tokenTotalSupply, bondingCurve: bc, amount: amt });
  if (out.lten(0)) throw Object.assign(new Error('nothing out'), { code: 'too_small' });
  // spot price (lamports per raw token) for the impact
  const vs = BigInt(bc.virtualQuoteReserves.toString()), vt = BigInt(bc.virtualTokenReserves.toString());
  const spot = Number(vs) / Number(vt);
  const exec = side === 'buy' ? Number(amount) / Number(out.toString()) : Number(out.toString()) / Number(amount);
  const impact = Math.abs(exec / spot - 1) * 100;
  const minOut = side === 'buy' ? out.toString() : out.sub(out.mul(new BN(Math.floor(slip * 10))).div(new BN(1000))).toString();
  const q = { route: 'pump', inAmount: String(amount), outAmount: out.toString(), minOut, maxIn: side === 'buy' ? amt.add(amt.mul(new BN(Math.floor(slip * 10))).div(new BN(1000))).toString() : String(amount), impact };
  if (!userStr) return q;
  const user = new PublicKey(userStr);
  const ixs = side === 'buy'
    ? await pump.PUMP_SDK.buyInstructions({ global, bondingCurveAccountInfo: bcInfo, bondingCurve: bc, associatedUserAccountInfo: null, mint, user, amount: out, solAmount: amt, slippage: slip, tokenProgram })
    : await pump.PUMP_SDK.sellInstructions({ global, bondingCurveAccountInfo: bcInfo, bondingCurve: bc, mint, user, amount: amt, solAmount: out, slippage: slip, tokenProgram, mayhemMode: bc.isMayhemMode, cashback: bc.isCashbackCoin });
  const { blockhash } = (await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }])).value;
  const tx = new VersionedTransaction(new TransactionMessage({ payerKey: user, recentBlockhash: blockhash, instructions: [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 300000 }), ...ixs
  ] }).compileToV0Message());
  return { ...q, tx: Buffer.from(tx.serialize()).toString('base64'), hash: sha(tx.message.serialize()) };
}

/** Send a signed transaction through our RPC; the signature back. */
export async function sendRaw(b64) {
  return rpc('sendTransaction', [String(b64), { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 3 }], 15000);
}
/** 'pending' | 'confirmed' | 'failed' (+ err) for a signature. */
export async function sigStatus(sig) {
  const r = await rpc('getSignatureStatuses', [[sig], { searchTransactionHistory: false }]);
  const v = r.value && r.value[0];
  if (!v) return { state: 'pending' };
  if (v.err) return { state: 'failed', err: v.err };
  return { state: v.confirmationStatus === 'confirmed' || v.confirmationStatus === 'finalized' ? 'confirmed' : 'pending' };
}

/** SOL and one token's balance for a wallet (raw units). */
export async function balances(ownerStr, mintStr) {
  const owner = new PublicKey(ownerStr);
  const [lamports, toks] = await Promise.all([
    rpc('getBalance', [owner.toBase58(), { commitment: 'confirmed' }]).then(r => r.value),
    mintStr && mintStr !== WSOL ? rpc('getTokenAccountsByOwner', [owner.toBase58(), { mint: mintStr }, { encoding: 'jsonParsed', commitment: 'confirmed' }]).then(r => r.value) : Promise.resolve([])
  ]);
  let raw = 0n, decimals = null;
  for (const a of toks || []) { const t = a.account.data.parsed.info.tokenAmount; raw += BigInt(t.amount); decimals = t.decimals; }
  return { lamports: String(lamports), token: raw.toString(), decimals };
}

/** The largest holders of a mint, their owners, and which of them is the curve. */
export async function holders(mintStr) {
  const mint = new PublicKey(mintStr);
  const [largest, supply] = await Promise.all([
    rpc('getTokenLargestAccounts', [mintStr, { commitment: 'confirmed' }]).then(r => r.value),
    rpc('getTokenSupply', [mintStr, { commitment: 'confirmed' }]).then(r => r.value)
  ]);
  const accs = (largest || []).slice(0, 20);
  const info = accs.length ? (await rpc('getMultipleAccounts', [accs.map(a => a.address), { encoding: 'jsonParsed', commitment: 'confirmed' }])).value : [];
  const curve = pump.bondingCurvePda(mint).toBase58();
  const total = BigInt(supply.amount || '0');
  return {
    supply: supply.amount, decimals: supply.decimals,
    holders: accs.map((a, i) => {
      const owner = info[i] && info[i].data && info[i].data.parsed ? info[i].data.parsed.info.owner : null;
      const amt = BigInt(a.amount);
      return { account: a.address, owner, amount: a.amount, pct: total > 0n ? Number(amt * 1000000n / total) / 10000 : 0, label: owner === curve ? 'bonding curve' : null };
    })
  };
}

/* ---------- metadata on pump.fun's IPFS ---------- */
// The coin's logo and metadata on IPFS. pump.fun no longer takes uploads at pump.fun/api/ipfs; its own docs
// (pump-fun/pump-fun-skills, create-coin/METADATA.md) pin both to public IPFS with Pinata: the logo first, then
// the metadata JSON that points to it, both served as https://ipfs.io/ipfs/<cid>.
// Env: PINATA_JWT (secret; a Pinata API key with files:write). PUMP_IPFS_URL: any other uploader that takes
// pump.fun's old form and answers { metadataUri } — used only when there's no Pinata key.
const IPFS_GW = 'https://ipfs.io/ipfs/';
async function pin(file, filename, type) {
  const form = new FormData();
  form.append('network', 'public');
  form.append('name', filename);
  form.append('file', new Blob([file], { type }), filename);
  const r = await fetch('https://uploads.pinata.cloud/v3/files', { method: 'POST', headers: { authorization: `Bearer ${process.env.PINATA_JWT}` }, body: form, signal: AbortSignal.timeout(20000) });
  const j = await r.json().catch(() => null);
  const cid = j && j.data && j.data.cid;
  if (!r.ok || !cid) throw Object.assign(new Error(`pinata ${r.status} ${j && (j.error && (j.error.message || j.error) || j.message) || ''}`.trim()), { code: 'ipfs', why: r.status === 401 || r.status === 403 ? 'pinata_key' : r.status === 429 ? 'pinata_busy' : 'pinata' });
  return cid;
}
export const ipfsReady = () => !!(process.env.PINATA_JWT || process.env.PUMP_IPFS_URL);
export async function uploadMetadata({ name, symbol, description, website, twitter, image }) {
  if (process.env.PINATA_JWT) {
    const ext = image.type === 'image/png' ? 'png' : 'jpg', tag = String(symbol).toLowerCase();
    const imgCid = await pin(image.bytes, `${tag}-logo.${ext}`, image.type);
    const meta = { name, symbol, description, image: IPFS_GW + imgCid, showName: true, createdOn: 'https://pump.fun', ...(twitter ? { twitter } : {}), ...(website ? { website } : {}) };
    const metaCid = await pin(Buffer.from(JSON.stringify(meta)), `${tag}-metadata.json`, 'application/json');
    return { uri: IPFS_GW + metaCid, image: meta.image };
  }
  if (!process.env.PUMP_IPFS_URL) throw Object.assign(new Error('no ipfs uploader: set PINATA_JWT'), { code: 'ipfs', why: 'no_pinata' });
  const form = new FormData();
  form.append('file', new Blob([image.bytes], { type: image.type }), image.type === 'image/png' ? 'logo.png' : 'logo.jpg');
  form.append('name', name); form.append('symbol', symbol); form.append('description', description);
  form.append('website', website); if (twitter) form.append('twitter', twitter); form.append('showName', 'true');
  const r = await fetch(process.env.PUMP_IPFS_URL, { method: 'POST', body: form, signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !j.metadataUri) throw Object.assign(new Error(`ipfs ${r.status}`), { code: 'ipfs', why: 'uploader' });
  return { uri: j.metadataUri, image: (j.metadata && j.metadata.image) || null };
}
