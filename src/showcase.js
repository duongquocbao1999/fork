/* forks — the graph the home page opens with: how crypto came to GitHub and how it reaches forks. git holds every
   repository; bitcoin started crypto; litecoin forked bitcoin and dogecoin forked litecoin; ethereum and solana
   followed bitcoin's idea; on solana, Anza and Jito forked the validator, Anchor became the framework, pump.fun
   was built on it — and forks is built on pump.fun. Every point is a real public repository (checked in November
   2026). Blue: a project's token tradable on Solana (bitcoin's and ethereum's are the wrapped ones, and say so);
   amber: a coin launched on forks — the one on forkwiki/fork is forks' own. Stars and years load from GitHub. */
(function () {
  'use strict';
  const nodes = [
    { repo: 'git/git', parent: null, rel: '', note: 'where every repository lives, 2005' },
    { repo: 'bitcoin/bitcoin', parent: 0, rel: 'kept in', note: 'where crypto began, 2009' },
    { repo: 'litecoin-project/litecoin', parent: 1, rel: 'fork', note: 'a fork of bitcoin, 2011' },
    { repo: 'dogecoin/dogecoin', parent: 2, rel: 'fork', note: 'the first meme coin, from litecoin' },
    { repo: 'ethereum/go-ethereum', parent: 1, rel: 'inspired by', note: 'programmable money' },
    { repo: 'solana-labs/solana', parent: 1, rel: 'inspired by', note: 'a chain built for speed' },
    { repo: 'anza-xyz/agave', parent: 5, rel: 'fork', note: 'the validator today' },
    { repo: 'jito-foundation/jito-solana', parent: 6, rel: 'fork', note: 'the MEV client' },
    { repo: 'solana-foundation/anchor', parent: 5, rel: 'built on', note: 'the framework Solana programs are written in' },
    { repo: 'pump-fun/pump-public-docs', parent: 8, rel: 'built on', note: 'pump.fun: a coin on a curve' },
    { repo: 'forkwiki/fork', parent: 9, rel: 'built on', note: 'forks: a coin on every repository' }
  ];
  window.ForksShowcase = {
    title: 'from git to forks',
    focus: 10,
    nodes,
    lines: 'Every repository lives in git. Crypto began in bitcoin/bitcoin; litecoin forked it, dogecoin forked litecoin, and ethereum and solana took the idea further. On Solana, Anza forked the validator and Jito forked it again, Anchor became the way programs are written, pump.fun was built on it — and forks is built on pump.fun: a coin on any repository, its fees going to the people who wrote the code. Blue is a project’s token on Solana; amber is a coin launched here. Tap any point.',
    follow: ['where did pump.fun come from?', 'what did bitcoin/bitcoin become?', '/info']
  };
})();
