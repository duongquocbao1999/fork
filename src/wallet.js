/* forks — Solana wallets through the Wallet Standard (Phantom, Solflare, Backpack and the rest register
   themselves on the page). No libraries: the page only ever hands the wallet bytes the server built and
   reads back what it signed. Inside the X app there is no wallet, so we offer to reopen the page in one. */
(function () {
  'use strict';
  const CHAIN = 'solana:mainnet';
  const found = [], listeners = [];
  let current = null, account = null;

  const usable = w => {
    const f = (w && w.features) || {};
    return Array.isArray(w.chains) && w.chains.includes(CHAIN) && f['standard:connect'] && f['solana:signTransaction'];
  };
  const emit = () => listeners.forEach(f => { try { f(state()); } catch (_) { } });
  function register(...ws) {
    for (const w of ws) if (usable(w) && !found.some(x => x === w || x.name === w.name)) found.push(w);
    emit();
    return () => { for (const w of ws) { const i = found.indexOf(w); if (i >= 0) found.splice(i, 1); } emit(); };
  }
  const api = Object.freeze({ register });
  addEventListener('wallet-standard:register-wallet', e => { try { e.detail(api); } catch (_) { } });
  try { dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: api })); } catch (_) { }

  const b64ToBytes = b => Uint8Array.from(atob(b), c => c.charCodeAt(0));
  function bytesToB64(u) {
    let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }
  const short = a => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '');
  const fail = (code, e) => Object.assign(new Error(code), { code, cause: e });
  const rejected = e => !!e && (e.code === 4001 || /reject|denied|declin|cancel|closed/i.test(String(e.message || e)));

  function state() {
    return { wallets: found.map(w => ({ name: w.name, icon: w.icon })), connected: account ? { address: account.address, short: short(account.address), name: current.name, icon: current.icon } : null };
  }
  // extensions inject a moment after load; give them that moment once
  async function list() {
    if (!found.length) await new Promise(r => setTimeout(r, 450));
    return state().wallets;
  }

  async function connect(name, opts) {
    const w = found.find(x => x.name === name) || found[0];
    if (!w) throw fail('no_wallet');
    let r;
    try { r = await w.features['standard:connect'].connect(opts && opts.silent ? { silent: true } : undefined); } catch (e) { throw fail(rejected(e) ? 'rejected' : 'connect', e); }
    const accs = (r && r.accounts && r.accounts.length ? r.accounts : w.accounts) || [];
    const a = accs.find(x => !x.chains || x.chains.includes(CHAIN)) || accs[0];
    if (!a) throw fail('no_account');
    current = w; account = a;
    try { localStorage.setItem('forks-wallet', w.name); } catch (_) { }
    const ev = w.features['standard:events'];
    if (ev && !w.__forksOn) {
      w.__forksOn = true;
      ev.on('change', ch => {
        if (current !== w || !ch || !ch.accounts) return;
        if (!ch.accounts.some(x => x.address === (account && account.address))) { account = ch.accounts[0] || null; if (!account) current = null; }
        emit();
      });
    }
    emit();
    return state().connected;
  }
  async function disconnect() {
    const w = current; current = null; account = null; emit();
    try { localStorage.removeItem('forks-wallet'); } catch (_) { }
    try { if (w && w.features['standard:disconnect']) await w.features['standard:disconnect'].disconnect(); } catch (_) { }
  }

  // sign every transaction in one prompt where the wallet can; one by one where it can't
  async function sign(b64s) {
    if (!current || !account) throw fail('not_connected');
    const f = current.features['solana:signTransaction'];
    const v = f.supportedTransactionVersions;
    if (Array.isArray(v) && !v.includes(0)) throw fail('no_v0');
    const input = b => ({ account, chain: CHAIN, transaction: b64ToBytes(b) });
    let out;
    try { out = await f.signTransaction(...b64s.map(input)); }
    catch (e) {
      if (rejected(e) || b64s.length === 1) throw fail(rejected(e) ? 'rejected' : 'sign', e);
      out = [];
      try { for (const b of b64s) out.push(...await f.signTransaction(input(b))); }
      catch (e2) { throw fail(rejected(e2) ? 'rejected' : 'sign', e2); }
    }
    if (!Array.isArray(out) || out.length !== b64s.length) throw fail('sign');
    return out.map(o => bytesToB64(o.signedTransaction));
  }

  // no wallet in this browser (the X app, a phone browser): reopen this page inside a wallet's own browser
  const mobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
  function openIn(url) {
    const u = encodeURIComponent(url), ref = encodeURIComponent(location.origin);
    return [
      ['Phantom', `https://phantom.app/ul/browse/${u}?ref=${ref}`],
      ['Solflare', `https://solflare.com/ul/v1/browse/${u}?ref=${ref}`]
    ];
  }
  const install = [['Phantom', 'https://phantom.com/download'], ['Solflare', 'https://solflare.com/download'], ['Backpack', 'https://backpack.app/download']];

  // the wallet used last time, reconnected without a prompt when the wallet allows it
  async function resume() {
    let name = null; try { name = localStorage.getItem('forks-wallet'); } catch (_) { }
    if (!name || account) return null;
    for (let i = 0; i < 6 && !found.some(w => w.name === name); i++) await new Promise(r => setTimeout(r, 250));
    if (!found.some(w => w.name === name)) return null;
    try { return await connect(name, { silent: true }); } catch (_) { return null; }
  }

  window.ForksWallet = { list, connect, disconnect, sign, state, short, mobile, openIn, install, resume, onChange: f => { listeners.push(f); } };
})();
