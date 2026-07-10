# Benchmark

Does the multi-model roundtable actually produce better output than a single model? This harness
tests it head-to-head.

## Method

For each goal, produce two answers with the **same model**:
1. **single** — one direct call
2. **roundtable** — the full brainstorm roundtable (proposer / critic / arbiter) converged

Then a **different model** judges the pair **blind** (it doesn't know which is which), scoring each
1–10 and picking a winner. Using the same model in both modes isolates the effect of the *process*;
using a different judge reduces bias.

## Run it

```bash
corepack pnpm build
node bench/run.mjs        # writes bench/REPORT.md
```

Defaults: contestants = Codex, judge = Claude. Edit `GOALS` and the model factories in `run.mjs` to
change the set. To test **frugal mode's** premise (free drafts, paid verifies), make the contestants
free OpenRouter models and keep a paid judge.

## Cost & caveats

- Real model calls — a few dozen per run; log your spend.
- Small goal sets are a **signal, not proof**. Grow `GOALS` for a launch-grade number.
- The judge can be biased toward its own style; rotate judges to check.
