---
id: 333
title: VHS terminal GIF demo
status: done
owner: codex-gpt-5
deps: [332]
owned_paths: ["demo.tape", "tasks/333-vhs-demo.md"]
acceptance:
  - demo.tape records the requested Quorum CLI story and outputs quorum-demo.gif
  - tape uses the approved Quorum palette with no off-brand color values
  - pnpm test passes
---
## Notes
User requested a Charmbracelet VHS tape for a short terminal GIF demoing the Quorum CLI launch, dashboard URL, consensus, workshop build, and merged result.

## Journal
- [codex-gpt-5] Started the VHS demo task. Verified local `vhs` is not installed, so I used the official VHS command reference for syntax and will validate what can be checked locally.
- [codex-gpt-5] Completed `demo.tape`. It simulates the launch with hidden shell functions, types `quorum`, shows the v2 banner plus dashboard URL, types the CSV-to-JSON goal, streams proposer/critic/arbiter/workshop lines, and ends on `✓ merged  (verified, 4 turns)`. Validated the shell preview text after stripping ANSI codes, confirmed all hex colors are approved Quorum palette values, and ran `pnpm test` successfully (172 tests). Could not render `quorum-demo.gif` locally because `vhs` is not installed on this machine.
