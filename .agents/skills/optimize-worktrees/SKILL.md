---
name: optimize-worktrees
description: >-
  Reduce duplicate Rust build outputs when opening or first using a local Fedi worktree.
  Use even when the user only asks to open a worktree or work on an issue, without mentioning caching.
  Does not apply to CI.
---

# optimize worktrees

from the worktree root, run build and test commands through the worktree shell:

```bash
nix develop .#worktree --command cargo check
```

replace `cargo check` with the ordinary cargo or just command the task needs. for an interactive session, enter `nix develop .#worktree` once and run commands inside it. the shell supplies python through nix. do not run the preparation script with host python.

on macOS/apfs, shell entry automatically clones compatible host debug dependencies from an idle worktree into a private `target-nix`. the files initially share disk blocks. local crates rebuild from this worktree's source. existing debug directories are left alone.

- let cargo build normally when reuse is unavailable. mobile targets and other platforms do not benefit from preparation. no manual seeding or reset is needed.
- keep writable target directories separate. do not symlink them together or copy runtime databases between worktrees.
- do not use `cargo clean` to force reuse or reclaim space without inspecting the target directory for runtime data. later builds can grow it; there is no automatic garbage collection.
- use `FEDI_WORKTREE_CACHE=0` to disable preparation. leave CI workflows and their shell selection alone.
