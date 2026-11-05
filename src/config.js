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
    // The /freeforks trials. handle without @ (the account to follow); post = the numeric id from
    // x.com/<postBy>/status/<post> (the post to like, retweet, comment on and quote); postBy = its author.
    // For now the post is the first post on Twitter, so the trials can be tested; swap in your own.
    // handle or post empty = the trials stay closed and /api/health lists them as missing.
    x: { handle: 'forkwikis', post: '20', postBy: 'jack' },
    quest: { command: '/freeforks', total: 10000 },
    links: { github: 'https://github.com/forkwiki/fork', x: 'https://x.com/forkwikis' },
    // Coins on repositories (pump.fun, Solana mainnet). Creator fees are split once, for good, between
    // the people behind the code (paid to their GitHub accounts, claimed on pump.fun) and forks.
    launch: {
      treasury: '',               // forks' Solana wallet for its share; empty = launches closed
      split: {                    // basis points, 10,000 = 100%
        owner: 7000,              // the repo's owner (a person) — or, for an organization, its top contributors
        contributors: 500,        // the top contributors besides the owner
        ancestors: [1000, 300, 200], // up the line: parent, grandparent, great-grandparent
        forks: 1000               // the treasury above
      },
      orgContributors: 5,         // how many people share an organization's part
      contributors: 2,            // how many share the contributors' part
      perDay: 3,                  // repositories a wallet may launch on per day, as shown on the page (enforced by app_config 'launch.per_day')
      tipSol: 0.0005              // Jito tip for the all-or-nothing bundle
    }
  };

  // Where each trial sends the user. The comment trial opens the post itself: in the X app
  // intent/tweet?in_reply_to= turns into a quote post.
  CONFIG.taskUrl = (type, x = CONFIG.x) => ({
    follow: `https://x.com/intent/follow?screen_name=${encodeURIComponent(x.handle)}`,
    like: `https://x.com/intent/like?tweet_id=${encodeURIComponent(x.post)}`,
    repost: `https://x.com/intent/retweet?tweet_id=${encodeURIComponent(x.post)}`,
    comment: `https://x.com/${encodeURIComponent(x.postBy || x.handle)}/status/${encodeURIComponent(x.post)}`
  }[type] || null);
  CONFIG.questOpen = (x = CONFIG.x) => !!(x.handle && x.post);

  if (typeof module === 'object' && module.exports) module.exports = CONFIG;
  else root.FORKS_CONFIG = CONFIG;
})(this);
