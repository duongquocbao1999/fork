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
    // what the page promises before sign-in; the amounts that land come from the database (tasks, app_config)
    quest: { command: '/freeforks', total: 10000, scan: [2000, 20000], invite: 2000, github: 3000 },
    links: { github: 'https://github.com/forkwiki/fork', x: 'https://x.com/forkwikis' },
    // Coins on repositories (pump.fun, Solana mainnet). Creator fees are split once, for good, between
    // the people behind the code (paid to their GitHub accounts, claimed on pump.fun) and forks.
    launch: {
      treasury: '61468ik7HhYNg8ixQYeF9caMNVm57PqTy3tyQ28F6Y5e', // forks' Solana wallet for its share (public address); empty = launches closed
      split: {                    // basis points, 10,000 = 100%
        owner: 7000,              // the repo's owner (a person) — or, for an organization, its top contributors
        contributors: 500,        // the top contributors besides the owner
        ancestors: [1000, 300, 200], // up the line: parent, grandparent, great-grandparent
        forks: 1000               // the treasury above
      },
      orgContributors: 5,         // how many people share an organization's part
      contributors: 2,            // how many share the contributors' part
      perDay: 3,                  // repositories a wallet may launch on per day, as shown on the page (enforced by app_config 'launch.per_day')
      tipSol: 0.0005,             // Jito tip for the all-or-nothing bundle
      maxDevBuySol: 20            // the most a launcher may buy in the launch bundle ("buy at launch")
    },
    // Project tokens: the official tokens of the organizations behind some repositories, keyed by GitHub
    // owner. Shown on trees and in the market, tradable in the terminal. Third-party tokens: not ours, not
    // endorsed; mints checked against DexScreener (Nov 2026).
    projects: [
      { owner: 'solana-labs', symbol: 'SOL', name: 'Solana', mint: 'So11111111111111111111111111111111111111112' },
      { owner: 'pump-fun', symbol: 'PUMP', name: 'Pump', mint: 'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn' },
      { owner: 'jito-foundation', symbol: 'JTO', name: 'Jito', mint: 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL' },
      { owner: 'jup-ag', symbol: 'JUP', name: 'Jupiter', mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN' },
      { owner: 'orca-so', symbol: 'ORCA', name: 'Orca', mint: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE' },
      { owner: 'raydium-io', symbol: 'RAY', name: 'Raydium', mint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R' },
      // owners lowercase (GitHub names are case-insensitive); each one checked against a live repository, each
      // mint against DexScreener, with at least ~$15K of liquidity (Nov 2026)
      { owner: 'pyth-network', symbol: 'PYTH', name: 'Pyth Network', mint: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3' },
      { owner: 'wormhole-foundation', symbol: 'W', name: 'Wormhole', mint: '85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ' },
      { owner: 'meteoraag', symbol: 'MET', name: 'Meteora', mint: 'METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL' },
      { owner: 'kamino-finance', symbol: 'KMNO', name: 'Kamino', mint: 'KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS' },
      { owner: 'drift-labs', symbol: 'DRIFT', name: 'Drift', mint: 'DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7' },
      { owner: 'debridge-finance', symbol: 'DBR', name: 'deBridge', mint: 'DBRiDgJAMsM95moTzJs7M9LnkGErpbv9v6CUR1DXnUu5' },
      { owner: 'metaplex-foundation', symbol: 'MPLX', name: 'Metaplex', mint: 'METAewgxyPbgwsseH8T16a39CQ5VyVxZi9zXiDPY18m' },
      { owner: 'metadaoproject', symbol: 'META', name: 'MetaDAO', mint: 'METAwkXcqyXKy1AtsSgJ8JiUHwGCafnZL38n3vYmeta' },
      { owner: 'helium', symbol: 'HNT', name: 'Helium', mint: 'hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux' },
      { owner: 'rendernetwork', symbol: 'RENDER', name: 'Render', mint: 'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof' },
      { owner: 'marinade-finance', symbol: 'MNDE', name: 'Marinade', mint: 'MNDEFzGvMt87ueuHvVU9VcTqsAP5b3fTGPsHuuPA5ey' },
      { owner: 'igneous-labs', symbol: 'CLOUD', name: 'Sanctum', mint: 'CLoUDKc4Ane7HeQcPpE3YHnznRxhMimJ4MyaUqyHFzAu' },
      { owner: 'nosana-ci', symbol: 'NOS', name: 'Nosana', mint: 'nosXBVoaCTtYdLvKY6Csb4AC8JCdQKKAaWYtx2ZMoo7' },
      { owner: 'genesysgo', symbol: 'SHDW', name: 'Shadow', mint: 'SHDWyBxihqiCj6YekG2GUr7wqKLeLAMK1gHZck9pL6y' },
      { owner: 'magiceden-oss', symbol: 'ME', name: 'Magic Eden', mint: 'MEFNBXixkEbait3xn9bkm8WsJzXtVsaJEn4c8Sam21u' },
      { owner: 'regolith-labs', symbol: 'ORE', name: 'ORE', mint: 'oreoU2P8bN6jkk3jbaiVxYnG1dCXcYxwhwyK9jSybcp' },
      { owner: 'tensor-foundation', symbol: 'TNSR', name: 'Tensor', mint: 'TNSRxcUxoT9xBG3de7PiJyTDYu7kskLqcpddxnEJAS6' },
      { owner: 'blockworks-foundation', symbol: 'MNGO', name: 'Mango', mint: 'MangoCzJ36AjZyKwVj3VnYU4GTonjfVEnJmvvWaxLac' },
      { owner: 'step-finance', symbol: 'STEP', name: 'Step Finance', mint: 'StepAscQoEioFxxWGnh2sLBDFp9d8rvKz2Yp39iDpyT' },
      { owner: 'solayer-labs', symbol: 'LAYER', name: 'Solayer', mint: 'LAYER4xPpTCb3QL8S9u41EAhAX7mhBn8Q6xMTwY2Yzc' },
      { owner: 'hivemapper', symbol: 'HONEY', name: 'Hivemapper', mint: '4vMsoUT2BWatFweudnQM1xedRLfJgJ7hswhcpz4xgBTy' }
    ],
    // The terminal. Trades on a pump.fun curve go straight to the curve (built by the server, signed by the
    // wallet); everything else goes through Jupiter. No forks fee on trades (feeBps 0; a Jupiter referral
    // account would be needed to take one).
    trade: {
      slippageBps: 500,           // default slippage, 5%
      quickBuy: [0.1, 0.5, 1],    // SOL buttons on the buy tab
      feeBps: 0
    }
  };
  // the project token of a repository, by its GitHub owner
  CONFIG.projectOf = repo => {
    const o = String(repo || '').split('/')[0].toLowerCase();
    return CONFIG.projects.find(p => p.owner === o) || null;
  };
  CONFIG.projectByMint = mint => CONFIG.projects.find(p => p.mint === mint) || null;

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
