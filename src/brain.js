/* forks — upstream's brain.
   Two layers. The archive layer answers instantly from hand-sourced data and never
   invents a parent or a date. The model layer (Claude in the viewer, or any
   OpenAI-compatible endpoint behind /api/ask) takes everything else: it searches the
   archive through tools first, and traces anything the archive doesn't hold as a
   lineage card of its own (trace_lineage). */
(function () {
  'use strict';
  const A = window.FORKS_ARCHIVE;
  const byId = new Map(A.nodes.map(n => [n.id, n]));
  const famName = id => (A.families.find(f => f.id === id) || {}).name || id;
  const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  /* ---------- archive helpers ---------- */
  const H = {};
  H.node = id => byId.get(id);
  H.famName = famName;
  H.when = n => {
    const d = new Date(n.date + 'T00:00:00Z'), y = d.getUTCFullYear(), m = MON[d.getUTCMonth()];
    if (n.approx === 'year') return '~' + y;
    if (n.approx === 'month') return '~' + m + ' ' + y;
    return (n.reported ? 'reported ' : '') + d.getUTCDate() + ' ' + m + ' ' + y;
  };
  H.ancestors = id => { const out = []; let n = byId.get(id); while (n && n.parent) { n = byId.get(n.parent); out.unshift(n); } return out; };
  H.subtree = id => { const out = []; const walk = i => byId.get(i).children.forEach(c => { out.push(byId.get(c)); walk(c); }); walk(id); return out; };
  H.roots = () => A.nodes.filter(n => !n.parent).sort((a, b) => b.descendants - a.descendants);
  H.hot = () => A.nodes.filter(n => n.forks30 > 0).sort((a, b) => b.forks30 - a.forks30 || b.descendants - a.descendants);
  H.deepest = id => H.subtree(id).sort((a, b) => b.depth - a.depth || b.date.localeCompare(a.date))[0] || null;
  H.traitsChanged = (a, b) => A.traits.filter(([k]) => a.traits[k] !== b.traits[k]);
  H.count = { nodes: A.nodes.length, roots: A.nodes.filter(n => !n.parent).length, sources: new Set(A.nodes.flatMap(n => n.sources.map(s => s[1]))).size };

  /* ---------- search ---------- */
  const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[“”"'’‘`]/g, '').replace(/\s+/g, ' ').trim();
  const bareUrl = s => norm(s).replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[?#].*$/, '').replace(/\/$/, '');
  function score(n, q) {
    if (!q) return 0;
    let s = 0; const name = norm(n.name), u = bareUrl(q);
    if (/^(https?:\/\/|www\.)|\.[a-z]{2,}\//.test(q)) {
      if (n.sources.some(([, url]) => bareUrl(url) === u)) s = Math.max(s, n.parent ? 70 : 92);
      const parts = u.split('/'); const h = parts[1] ? parts[1].replace(/^@/, '') : '';
      if (h && n.handle && norm(n.handle).replace(/^@|^u\//, '') === h) s = Math.max(s, 96);
      return s;
    }
    if (q.startsWith('$') && n.ticker && norm(n.ticker) === q) return 100;
    if (name === q) s = 98;
    else if (name.startsWith(q) && q.length > 2) s = 82;
    else if (q.length > 3 && name.includes(q)) s = 70;
    else if (q.length > 3 && q.includes(name)) s = 74;
    for (let a of n.aliases) { a = norm(a); if (a === q) s = Math.max(s, 94); else if (q.length > 2 && (a.includes(q) || (a.length > 3 && q.includes(a)))) s = Math.max(s, 66); }
    if (n.ticker && norm(n.ticker).slice(1) === q) s = Math.max(s, 90);
    if (n.handle && norm(n.handle).replace(/^@|^u\//, '') === q.replace(/^@|^u\//, '')) s = Math.max(s, 92);
    if (!s) {
      const words = q.split(' ').filter(w => w.length > 2);
      const hits = words.filter(w => name.split(/[^a-z0-9$#]+/).some(x => x === w || (w.length > 3 && x.startsWith(w)))).length;
      if (hits) s = 30 + hits * 18;
      if (!s && q.length > 4 && norm(n.desc).includes(q)) s = 40;
    }
    if (s) s += (n.parent ? 0 : 4) + Math.min(6, n.descendants / 3);
    return s;
  }
  const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
  const translit = q => q.replace(/[а-яё]/g, c => TR[c] ?? c);
  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 3) return 99;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) { const cur = [i]; for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
    return prev[b.length];
  }
  function fuzzy(n, q) {
    if (q.length < 4) return 0;
    let best = 0;
    for (const c of [n.name].concat(n.aliases)) { const t = norm(c); const d = lev(q, t); const sim = 1 - d / Math.max(q.length, t.length); if (sim >= .72) best = Math.max(best, 60 + sim * 20); }
    return best;
  }
  H.search = (q, limit = 6) => {
    q = norm(q); if (!q) return [];
    const qs = /[а-яё]/.test(q) ? [q, translit(q)] : [q];
    return A.nodes.map(n => [n, Math.max(...qs.map(x => Math.max(score(n, x), fuzzy(n, x))))]).filter(r => r[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, limit);
  };

  /* ---------- intent ---------- */
  const RX = {
    quest: /^\/?free ?forks\b|^get \+?5[ ,.]?000 \$?forks?\b/,
    persona: /\b(who are you|what are you|what is (this|forks)|how does this work)\b|ты кто|кто ты|что это|что ты/,
    help: /^(help|commands|\?)$|\bhelp\b|помощ|команд/,
    hot: /\b(hot|trending|forking now|right now|lately|this week|latest)\b|сейчас|тренд|горяч|новое/,
    archive: /\b(archive|everything|all (lineages|of them)|what do you (have|know)|list)\b|архив|всё|все линии/,
    random: /\b(surprise|random|anything|pick one)\b|удиви|случайн/,
    sources: /\b(sources?|proof|evidence|cite|links?)\b|источник|пруф|доказ/,
    changed: /\b(chang|mutat|differ|vs\.?|versus|compare)|изменил|разниц|мутац|сравн/,
    became: /\b(become|became|turn(ed)? into|spawn|descend|children|what came after|what did .* (do|make)|forks? of|forked into)\b|во что|потомк|породил|стал[аио]?\b|превратил/,
    origin: /\b(where|come from|came from|origin|started|start|parent|upstream|trace|who made|first)\b|откуда|начал|происхожд|родител|появил/,
    describe: /^(who|what) (is|are|was|were)\b|tell me about|explain|кто так|что так|расскажи/
  };
  const STOP = new Set('where did does do come came from what who is are was were the a an of to into become became turn turned tell me about trace show sources source for changed change mutate mutated between and how it this that with origin lineage forks fork meme memes thing story parent upstream first start started make made explain please pls pick on in its it\'s vs versus compare differ different did cite proof evidence links link what\'s whats forking forked right now lately trending hot latest week surprise me random anything one everything all list have know you your откуда взялся взялась взялось кто что такое это расскажи про о об во стал стала стало произошел появился мем сейчас удиви меня форкается'.split(' '));
  function entityText(raw) {
    return norm(raw).replace(/[?!.,;:]+/g, ' ').split(' ').filter(w => w && !STOP.has(w)).join(' ').trim();
  }
  function detect(raw) {
    const t = norm(raw);
    const cmd = t.match(/^\/(\w+)\s*(.*)$/);
    if (cmd) return { intent: { trace: 'origin', origin: 'origin', became: 'became', forks: 'became', changed: 'changed', mutation: 'changed', sources: 'sources', hot: 'hot', random: 'random', archive: 'archive', help: 'help', clear: 'clear', about: 'persona', freeforks: 'quest', logout: 'logout', signout: 'logout' }[cmd[1]] || 'unknown', q: cmd[2], cmd: true };
    if (RX.quest.test(t)) return { intent: 'quest', q: '' };
    for (const k of ['persona', 'help', 'hot', 'archive', 'random']) if (RX[k].test(t) && entityText(raw).length < 3) return { intent: k, q: '' };
    for (const k of ['sources', 'changed', 'became', 'origin', 'describe']) if (RX[k].test(t)) return { intent: k, q: entityText(raw) };
    return { intent: 'auto', q: /^(https?:\/\/|www\.)|^[\w-]+(\.[\w-]+)*\.[a-z]{2,}\//.test(t) ? t : (t.startsWith('$') ? t.split(' ')[0] : entityText(raw) || t) };
  }

  /* ---------- the archive layer ---------- */
  const pct = v => Math.round(v * 100) + '%';
  function pathLine(n) { const anc = H.ancestors(n.id); return anc.concat(n).map(x => x.name).join(' → '); }
  function linkStats(n) {
    const path = H.ancestors(n.id).slice(1).concat(n.parent ? [n] : []);
    const v = path.filter(x => x.relation === 'VERIFIED').length;
    return { links: path.length, verified: v };
  }
  const R = {};
  R.origin = n => {
    if (!n.parent) return R.became(n, true);
    const anc = H.ancestors(n.id), root = anc[0], p = byId.get(n.parent), st = linkStats(n);
    const gens = anc.length;
    const text = `${n.name} came from ${p.name}` +
      (p.id === root.id ? ` — the origin itself, ${H.when(root)} on ${root.plat.toLowerCase()}.\n` : `.\nthe line runs ${gens} generations back to ${root.name}, ${H.when(root)} on ${root.plat.toLowerCase()}.\n`) +
      (n.desc ? n.desc + '\n' : '') +
      `${st.verified} of ${st.links} link${st.links > 1 ? 's' : ''} verified · path confidence ${pct(n.pathConf)}.`;
    return { text, cards: [{ type: 'lineage', root: root.id, focus: n.id }], follow: [`what did ${root.name} become?`, `what changed from ${root.name} to ${n.name}?`, `/sources ${n.id}`], light: true };
  };
  R.became = (n, asOrigin) => {
    const sub = H.subtree(n.id), far = H.deepest(n.id);
    let text;
    if (!sub.length) text = `${n.name} hasn't forked yet. it's a leaf — for now.\nit came from ${byId.get(n.parent).name}.`;
    else text = (asOrigin ? `${n.name} is an origin. nothing older in the archive — ${H.when(n)}, ${n.plat.toLowerCase()}.\n` : '') +
      `${n.name} forked ${n.forks} time${n.forks > 1 ? 's' : ''} directly, ${sub.length} descendant${sub.length > 1 ? 's' : ''} in total, ${n.depthBelow} generation${n.depthBelow > 1 ? 's' : ''} deep.\n` +
      `furthest from home: ${far.name}, ${H.when(far)}.`;
    const root = n.parent ? H.ancestors(n.id)[0] : n;
    return { text, cards: [{ type: 'lineage', root: root.id, focus: n.id }], follow: far ? [`what changed from ${n.name} to ${far.name}?`, `/sources ${n.id}`, 'what is forking right now?'] : ['what is forking right now?'], light: true };
  };
  R.changed = (a, b) => {
    if (!b) { if (a.parent) { b = a; a = H.ancestors(a.id)[0]; } else { b = H.deepest(a.id); } }
    if (!a || !b || a.id === b.id) return { text: `${a ? a.name : 'that'} has nothing to compare against yet.`, cards: [] };
    const okLine = H.ancestors(b.id).some(x => x.id === a.id);
    if (!okLine) return { text: `${b.name} doesn't descend from ${a.name}. different trees. i only compare a thing with its own ancestors.`, cards: [] };
    const ch = H.traitsChanged(a, b);
    const text = `from ${a.name} to ${b.name}: ${ch.length} of ${A.traits.length} traits mutated.\n${ch.length ? 'what broke off: ' + ch.map(c => c[1].toLowerCase()).join(', ') + '.' : 'a straight copy.'}`;
    return { text, cards: [{ type: 'mutation', a: a.id, b: b.id }], follow: [`where did ${b.name} come from?`, `/sources ${b.id}`] };
  };
  R.sources = n => {
    const srcs = [...new Map(H.ancestors(n.id).concat(n).flatMap(x => x.sources).map(s => [s[1], s])).values()];
    return { text: `${srcs.length} source${srcs.length > 1 ? 's' : ''} behind ${n.name} and its line. don't take my word for it.`, cards: [{ type: 'sources', id: n.id }], follow: [`where did ${n.name} come from?`] };
  };
  R.describe = n => {
    const base = n.parent ? R.origin(n) : R.became(n, true);
    return { text: `${n.desc.toLowerCase().replace(/\.$/, '')}.\n\n` + base.text, cards: base.cards, follow: base.follow, light: true };
  };
  R.hot = () => ({ text: 'forking right now. the last thirty days of the archive:', cards: [{ type: 'hot' }], follow: ['where did jean philanthrope come from?', 'surprise me'] });
  R.archive = () => ({ text: `everything i can vouch for: ${H.count.roots} origins, ${H.count.nodes} objects, ${H.count.sources} sources. pick a line.`, cards: [{ type: 'archive' }] });
  R.persona = () => ({ text: `i'm upstream. i keep the family tree of internet culture.\nevery meme, phrase, character and token forked from something older.\ntype anything — a word, a ticker, a link, a whole sentence — and i'll trace where it came from.`, follow: ['where did doge come from?', 'what did chill guy become?', 'trace "touch grass"', '/freeforks'] });
  R.help = () => ({ text: 'ask in plain words, or use a command:\n/trace <thing>    where it came from\n/became <thing>   what it turned into\n/changed <thing>  what mutated on the way\n/sources <thing>  the receipts\n/hot              forking right now\n/archive          every origin i keep\n/random           surprise me\n/freeforks        four trials on x · +5,000 $FORK, pending\n/clear            start over', follow: ['/hot', '/archive', '/freeforks'] });
  R.random = () => { const pool = A.nodes.filter(n => n.parent && n.depth >= 2); const n = pool[Math.floor(Math.random() * pool.length)]; const r = R.origin(n); r.text = `here's one — ${n.name}.\n` + r.text; return r; };
  R.notFound = (q, near) => ({
    text: q ? `“${q}” isn't in the archive yet.` + (near.length ? `\nclosest i have:` : '') : `give me something to trace — a word, a ticker, a link.`,
    follow: near.length ? near.slice(0, 3).map(([n]) => `where did ${n.name} come from?`) : ['/archive', 'surprise me']
  });

  function archiveAnswer(raw) {
    const d = detect(raw);
    if (d.intent === 'clear') return { clear: true };
    if (d.intent === 'quest' || d.intent === 'logout') return { quest: d.intent };
    if (R[d.intent] && ['persona', 'help', 'hot', 'archive', 'random'].includes(d.intent)) return { confident: true, ...R[d.intent]() };
    let q = d.q;
    if (d.intent === 'changed') {
      const parts = norm(raw).replace(/^\/\w+\s*/, '').split(/\s+(?:to|vs\.?|versus|and|->|→|и|до)\s+/);
      if (parts.length === 2) {
        const a = H.search(entityText(parts[0]) || parts[0])[0], b = H.search(entityText(parts[1]) || parts[1])[0];
        if (a && b && a[1] >= 60 && b[1] >= 60) return { confident: true, ...R.changed(a[0], b[0]) };
      }
    }
    const hits = byId.has(q) ? [[byId.get(q), 100]] : H.search(q);
    const best = hits[0];
    if (!best || best[1] < 58) return { confident: false, q, near: hits.filter(h => h[1] >= 30), intent: d.intent, cmd: d.cmd };
    const n = best[0];
    const intent = d.intent === 'auto' ? (n.parent ? 'origin' : 'became') : d.intent;
    const out = intent === 'became' ? R.became(n, !n.parent) : intent === 'changed' ? R.changed(n) : intent === 'sources' ? R.sources(n) : intent === 'describe' ? R.describe(n) : R.origin(n);
    return { confident: true, ...out };
  }

  /* ---------- the model layer ---------- */
  const RULES = `You are "upstream", the voice of forks.wiki: the family tree of internet culture. Every meme, phrase, character, token, format and idea forked from something older. Whatever the user types — a word, a phrase, a name, a ticker, a link, a whole sentence — you show where it came from and how it forked into what they asked about.

Voice: lowercase, short, dry, a little aloof, sure of yourself. No emoji. No hype. Two to four short lines. Reply in the language the user writes in.

How to answer:
1. Call search_archive first. The archive has ${H.count.nodes} hand-sourced objects in ${H.count.roots} lineages (origins: ${H.roots().map(r => r.name).join(', ')}). If it has the thing, show it with show_lineage (or show_mutation / show_sources when asked) and never change its facts.
2. If the archive doesn't have it, call trace_lineage: the line from the earliest origin to the thing the user asked about. 4 to 9 nodes. nodes[0] is the origin; mark the node that is what the user asked about with "query": true. Add one to three side forks that branched off the line when they exist. Each node gets a short name, when (a year, or month and year) and a note of what changed at that fork, a few words ("+ ticker", "moved to tiktok", "lost the image").
3. Keep to the account most people who know the subject would agree with. When an exact date isn't well known, give the year. A plain word or a sentence: trace the phrase, format or idea itself and how it travelled online.
4. Then write the one thing worth knowing about the line. State it plainly. Don't hedge and don't talk about memory, guesses or verification: the page shows where each tree comes from.
5. Never invent links or sources. Never give financial advice about tokens. Never ask for wallets, keys or personal data.
6. $FORK rewards are handled by the page: if asked about them, tell the user to type /freeforks.
7. For questions unrelated to internet culture, answer in one line and steer back.`;

  function toolsFor(ui) {
    const lean = n => ({ id: n.id, name: n.name, type: n.type, when: H.when(n), platform: n.plat, family: famName(n.family), parent: n.parent ? byId.get(n.parent).name : null, descendants: n.descendants });
    return [
      { name: 'search_archive', description: 'Search the sourced archive by name, alias, ticker, handle or URL. Returns up to 6 matches with ids. Call before showing anything.',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
        execute: ({ query }) => { const r = H.search(String(query || '')); return r.length ? r.map(([n, s]) => ({ ...lean(n), match: Math.round(s) })) : 'no matches in the archive'; } },
      { name: 'show_lineage', description: 'Draw an object\'s lineage card for the user (its whole family tree, with the object highlighted). Returns its ancestors and children so you can comment.',
        inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        execute: ({ id }) => { const n = byId.get(String(id)); if (!n) throw new Error('unknown id; call search_archive'); const root = n.parent ? H.ancestors(n.id)[0] : n; ui.card({ type: 'lineage', root: root.id, focus: n.id }); ui.light(); return { object: lean(n), description: n.desc, ancestors: H.ancestors(n.id).map(lean), children: n.children.map(c => lean(byId.get(c))), path_confidence: pct(n.pathConf) }; } },
      { name: 'show_mutation', description: 'Draw a then→now comparison of eight traits between an ancestor and one of its descendants. Returns the changed traits.',
        inputSchema: { type: 'object', properties: { ancestor_id: { type: 'string' }, descendant_id: { type: 'string' } }, required: ['ancestor_id', 'descendant_id'] },
        execute: ({ ancestor_id, descendant_id }) => { const a = byId.get(String(ancestor_id)), b = byId.get(String(descendant_id)); if (!a || !b) throw new Error('unknown id'); if (!H.ancestors(b.id).some(x => x.id === a.id)) throw new Error('not an ancestor of that object'); ui.card({ type: 'mutation', a: a.id, b: b.id }); return H.traitsChanged(a, b).map(([k, l]) => ({ trait: l, then: a.traits[k], now: b.traits[k] })); } },
      { name: 'show_sources', description: 'Show the public sources behind an object and its line. Returns their titles.',
        inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        execute: ({ id }) => { const n = byId.get(String(id)); if (!n) throw new Error('unknown id'); ui.card({ type: 'sources', id: n.id }); return n.sources.map(s => s[0]); } },
      { name: 'show_hot', description: 'Show objects in the archive with the most forks in the last 30 days.', execute: () => { ui.card({ type: 'hot' }); return H.hot().slice(0, 6).map(n => ({ name: n.name, forks_30d: n.forks30 })); } },
      { name: 'trace_lineage', description: 'For anything NOT in the archive: draw its family tree for the user. nodes[0] is the earliest origin; every later node names its parent by index (an earlier node). Mark the node that is what the user asked about with query: true.',
        inputSchema: { type: 'object', properties: { title: { type: 'string', description: 'what the user asked about, a few words' }, nodes: { type: 'array', minItems: 2, maxItems: 9, items: { type: 'object', properties: { name: { type: 'string' }, parent: { type: 'integer', description: 'index of the parent node; omit for nodes[0]' }, when: { type: 'string', description: 'year, or month and year' }, note: { type: 'string', description: 'what changed at this fork, a few words' }, query: { type: 'boolean' } }, required: ['name'] } } }, required: ['title', 'nodes'] },
        execute: ({ title, nodes }) => {
          const list = (Array.isArray(nodes) ? nodes : []).slice(0, 9).map((x, i) => ({
            name: String((x && x.name) || '?').slice(0, 48),
            parent: i === 0 ? null : (Number.isInteger(x && x.parent) && x.parent >= 0 && x.parent < i ? x.parent : i - 1),
            when: x && x.when ? String(x.when).slice(0, 16) : '', note: x && x.note ? String(x.note).slice(0, 80) : '', query: !!(x && x.query)
          }));
          if (list.length < 2) throw new Error('need at least the origin and the thing itself');
          let focus = list.findIndex(x => x.query); if (focus < 1) focus = list.length - 1;
          ui.card({ type: 'traced', title: String(title || list[focus].name).slice(0, 60), nodes: list, focus }); if (ui.light) ui.light();
          return 'drawn for the user';
        } }
    ];
  }

  const AI = { kind: null, sample: null };
  (async () => {
    const hosted = !/^https?:$/.test(location.protocol) || /claude\.ai|claudeusercontent|anthropic/.test(location.hostname);
    for (let i = 0; hosted && i < 30 && !(window.claude && window.claude.use); i++) await new Promise(r => setTimeout(r, 100));
    try { if (window.claude && window.claude.use) { const s = await window.claude.use('sample'); if (s) { AI.sample = s; AI.kind = 'claude'; window.dispatchEvent(new Event('forks-ai')); return; } } } catch (_) { }
    if (hosted) return;
    try { const r = await fetch('/api/ask', { method: 'GET' }); if (r.ok) { const j = await r.json(); if (j && j.ok) { AI.kind = 'endpoint'; window.dispatchEvent(new Event('forks-ai')); } } } catch (_) { }
  })();

  async function modelAnswer(history, ui, signal) {
    const tools = toolsFor(ui);
    if (AI.kind === 'claude') {
      const turns = history.map(h => ({ role: h.role, content: String(h.content || '') })).filter(h => h.content);
      while (turns.length && turns[0].role !== 'user') turns.shift();
      if (!turns.length) throw { code: 'no_model' };
      turns[0] = { role: 'user', content: RULES + '\n\n---\n\n' + turns[0].content };
      const { text } = await AI.sample(turns, { tools, modelTier: 'quick', signal, onText: ({ text }) => ui.stream(text) });
      return text;
    }
    if (AI.kind === 'endpoint') {
      // The server adds RULES and the tool list itself (netlify/lib/upstream.mjs, generated from this file).
      const msgs = history.map(h => ({ role: h.role, content: String(h.content || '') })).filter(h => h.content);
      for (let round = 0; round < 5; round++) {
        const r = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: msgs }), signal });
        if (!r.ok) throw { code: r.status === 429 ? 'rate_limited' : 'upstream_error' };
        const m = (await r.json()).message;
        msgs.push(m);
        if (!m.tool_calls || !m.tool_calls.length) { ui.stream(m.content || ''); return m.content || ''; }
        for (const c of m.tool_calls) {
          const t = tools.find(x => x.name === c.function.name); let out;
          try { out = t ? await t.execute(JSON.parse(c.function.arguments || '{}'), { signal }) : 'unknown tool'; } catch (e) { out = 'Error: ' + (e.message || e); }
          msgs.push({ role: 'tool', tool_call_id: c.id, content: typeof out === 'string' ? out : JSON.stringify(out) });
        }
      }
      return '';
    }
    throw { code: 'no_model' };
  }

  // RULES and toolSpecs are read by scripts/build-upstream.cjs, so the hosted endpoint sends the model exactly this.
  const toolSpecs = () => toolsFor(null).map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
  window.ForksBrain = { H, detect, archiveAnswer, modelAnswer, AI, R, RULES, toolSpecs };
})();
