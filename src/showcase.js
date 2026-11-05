/* forks — the graph the home page opens with: where pump.fun's code comes from, on Solana. Every point is a
   real public repository and every edge a real relation (GitHub's own fork record where there is one, else
   what the code is built on), checked by hand in November 2026. Tokens come from config.projects (by owner)
   and from coins launched on forks; prices are live. Stars, years and descriptions load from GitHub. */
(function () {
  'use strict';
  const nodes = [
    { repo: 'solana-labs/solana', parent: null, rel: '', note: 'the original validator, archived in 2025' },
    { repo: 'anza-xyz/agave', parent: 0, rel: 'fork', note: 'the validator today' },
    { repo: 'jito-foundation/jito-solana', parent: 1, rel: 'fork', note: 'the MEV client' },
    { repo: 'firedancer-io/firedancer', parent: 0, rel: 'rewrite', note: 'a second validator, in C' },
    { repo: 'otter-sec/anchor', parent: 0, rel: 'built on', note: 'the framework most programs are written in' },
    { repo: 'pump-fun/pump-public-docs', parent: 4, rel: 'built on', note: 'pump.fun’s programs and IDLs' },
    { repo: 'orca-so/whirlpools', parent: 4, rel: 'built on', note: 'concentrated liquidity' },
    { repo: 'jup-ag/whirlpools', parent: 6, rel: 'fork', note: 'Jupiter’s fork of Orca’s pools' },
    { repo: 'raydium-io/raydium-cp-swap', parent: 4, rel: 'built on', note: 'Raydium’s constant-product AMM' }
  ];
  window.ForksShowcase = {
    title: 'the solana family',
    focus: 5,
    nodes,
    lines: 'pump.fun is written in Anchor, the framework built on Solana’s validator, which Anza forked to keep it going and Jito forked again. Orca, Jupiter and Raydium grew from the same root. Blue is a project’s own token, priced live; amber is a coin launched on forks. Tap any point.',
    follow: ['where did llama.cpp come from?', 'what did bitcoin/bitcoin become?', '/info']
  };
})();
