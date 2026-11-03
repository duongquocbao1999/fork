// forks.wiki — optional model layer.
// The page works without this: with no key set, GET /api/ask answers {ok:false} and the
// site stays "archive only". With a key, plain-language questions go to any
// OpenAI-compatible chat endpoint. The model never sees the archive directly: it can
// only call the page's tools (search_archive, show_lineage, ...), which run in the browser.
//
// The system prompt and the tool list come from netlify/lib/upstream.mjs (built from
// src/brain.js), never from the request: callers can only send chat turns, so this
// endpoint can't be borrowed as a general-purpose model on our key.
//
// Netlify → Site configuration → Environment variables:
//   FORKS_LLM_KEY    API key (required to switch the model on)
//   FORKS_LLM_URL    chat completions URL   (default https://api.openai.com/v1/chat/completions)
//   FORKS_LLM_MODEL  model name             (default gpt-4o-mini)
import { SYSTEM, TOOLS } from '../lib/upstream.mjs';

const MAX_BODY = 64_000;          // bytes of JSON per request
const MAX_MESSAGES = 60;          // 10 chat turns + up to 5 tool rounds
const MAX_CALLS = 6;              // tool calls per assistant turn
const LIMIT = { user: 500, assistant: 2000, tool: 8000, args: 2000, id: 80 };
const WINDOW_MS = 60_000, PER_WINDOW = Number(process.env.FORKS_ASK_PER_MIN) || 12; // per IP, per warm instance
const UPSTREAM_TIMEOUT_MS = 9_000; // answer before the platform kills the function
const NAMES = new Set(TOOLS.map(t => t.function.name));
const hits = new Map(); // best-effort, per warm instance

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
});

function limited(ip) {
  const now = Date.now(), list = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > PER_WINDOW;
}

/** Only our own pages: a JSON body forces a CORS preflight elsewhere; Origin must be our host (www or not). */
function sameSite(req) {
  if (!(req.headers.get('content-type') || '').includes('application/json')) return false;
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return false;
  const origin = req.headers.get('origin');
  if (!origin) return true;
  const bare = h => h.replace(/^www\./, '');
  try { return bare(new URL(origin).hostname) === bare(new URL(req.url).hostname); } catch { return false; }
}

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Keep only the turns the page produces. Returns null for anything else (system turns, unknown tools). */
function clean(list) {
  if (!Array.isArray(list) || !list.length || list.length > MAX_MESSAGES) return null;
  const out = [];
  for (const m of list) {
    if (!m || typeof m !== 'object') return null;
    if (m.role === 'user') {
      const content = str(m.content, LIMIT.user);
      if (!content) return null;
      out.push({ role: 'user', content });
    } else if (m.role === 'assistant') {
      const calls = m.tool_calls == null ? [] : m.tool_calls;
      if (!Array.isArray(calls) || calls.length > MAX_CALLS) return null;
      if (calls.some(c => !c || c.type !== 'function' || !NAMES.has(c.function && c.function.name))) return null;
      const msg = { role: 'assistant', content: str(m.content, LIMIT.assistant) };
      if (calls.length) msg.tool_calls = calls.map(c => ({ id: str(c.id, LIMIT.id), type: 'function', function: { name: c.function.name, arguments: str(c.function.arguments, LIMIT.args) || '{}' } }));
      out.push(msg);
    } else if (m.role === 'tool') {
      out.push({ role: 'tool', tool_call_id: str(m.tool_call_id, LIMIT.id), content: str(m.content, LIMIT.tool) });
    } else {
      return null;
    }
  }
  return out.some(m => m.role === 'user') ? out : null;
}

export default async (req, context) => {
  const key = process.env.FORKS_LLM_KEY;
  if (req.method === 'GET') return json({ ok: !!key });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (!key) return json({ error: 'model off' }, 503);
  if (!sameSite(req)) return json({ error: 'origin' }, 403);
  if (limited(context?.ip || req.headers.get('x-nf-client-connection-ip') || 'anon')) return json({ error: 'rate_limited' }, 429);

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: 'too long' }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: 'bad json' }, 400); }
  const messages = clean(body && body.messages);
  if (!messages) return json({ error: 'bad messages' }, 400);
  // the page asks once more with force=trace_repos when a reply came back without a tree
  const force = body.force && NAMES.has(body.force) ? { type: 'function', function: { name: body.force } } : undefined;

  const r = await fetch(process.env.FORKS_LLM_URL || 'https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: process.env.FORKS_LLM_MODEL || 'gpt-4o-mini', messages: [{ role: 'system', content: SYSTEM }, ...messages], tools: TOOLS, tool_choice: force, temperature: 0.4, max_tokens: 900 }),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
  }).catch(e => (e && e.name === 'TimeoutError' ? 'timeout' : null));
  if (r === 'timeout') return json({ error: 'upstream timeout' }, 504);
  if (!r || !r.ok) {
    if (r) console.error('upstream', r.status, (await r.text().catch(() => '')).slice(0, 300));
    return json({ error: 'upstream', status: r ? r.status : 0 }, 502);
  }
  const data = await r.json().catch(() => null);
  const message = data?.choices?.[0]?.message;
  if (!message) return json({ error: 'empty' }, 502);
  return json({ message: { role: 'assistant', content: message.content || '', tool_calls: message.tool_calls } });
};

export const config = { path: '/api/ask' };
