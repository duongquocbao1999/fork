# forks — Motion System

Motion says one of three things: *I'm listening*, *I'm thinking*, *here's the path*. Everything respects `prefers-reduced-motion` (the field still draws, it just stops growing; text appears at once).

## The field (`src/field.js`)
| State | When | What happens |
|---|---|---|
| idle | nothing focused | every ~1.8s a tip forks; past the cap (260 segments, 130 on phones) the oldest tip fades |
| listening | input focused or typing | growth every 450ms, new branches bend toward the input, nearby branches brighten |
| thinking | waiting for an answer | growth every 300ms, signals run from the origin down random routes every 160ms |
| lit path | an answer with a lineage | the route from the origin to the tip nearest the answer draws in mint over 1.4s, a dotted connector reaches the message, everything fades by 5.2s |
| burst | an answer lands | seven short mint sprouts from the avatar |
| tap | click empty background | a small ink sprout where you clicked |
| chat dim | conversation mode | the whole field fades back (80%, 90% on phones) so text stays readable; the lit path is skipped on phones |

## Everything else
- **Question** — words rise and unblur in sequence (110ms stagger, 0.9s each); the underline draws after them, then its tip dot pops.
- **Messages** — rise 10px and fade in (0.45s).
- **Replies** — typed at ~90 steps regardless of length, with a mint block caret.
- **Thinking dots** — three mint dots pulsing in turn.
- **Tree cards** — edges reveal left→right by generation (140ms per generation), nodes fade in after their edge.
- **Full tree** — fades in (0.25s); no zoom, no camera.
