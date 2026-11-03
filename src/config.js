/* forks — every public setting in one place. Loaded by the page (window.FORKS_CONFIG) and
   imported by the Netlify functions, so the X account and the post for the trials live here only.
   Rewards are not here: the server decides them (supabase/migrations, table tasks). */
(function (root) {
  const CONFIG = {
    site: { name: 'forks', url: 'https://forks.wiki', host: 'forks.wiki' },
    token: {
      ticker: '$FORK',
      ca: '',                     // Solana mint once it exists; empty shows "launching soon"
      chain: 'solana'
    },
    // The /freeforks trials. handle without @; post = the numeric id from x.com/<handle>/status/<id>.
    // Both empty = the trials stay closed and /api/health lists them as missing.
    x: { handle: '', post: '' },
    quest: { command: '/freeforks', total: 5000 },
    links: { github: 'https://github.com/forkwiki/fork' }
  };

  // Where each trial sends the user. The comment trial opens the post itself: in the X app
  // intent/tweet?in_reply_to= turns into a quote post.
  CONFIG.taskUrl = (type, x = CONFIG.x) => ({
    follow: `https://x.com/intent/follow?screen_name=${encodeURIComponent(x.handle)}`,
    like: `https://x.com/intent/like?tweet_id=${encodeURIComponent(x.post)}`,
    repost: `https://x.com/intent/retweet?tweet_id=${encodeURIComponent(x.post)}`,
    comment: `https://x.com/${encodeURIComponent(x.handle)}/status/${encodeURIComponent(x.post)}`
  }[type] || null);
  CONFIG.questOpen = (x = CONFIG.x) => !!(x.handle && x.post);

  if (typeof module === 'object' && module.exports) module.exports = CONFIG;
  else root.FORKS_CONFIG = CONFIG;
})(this);
