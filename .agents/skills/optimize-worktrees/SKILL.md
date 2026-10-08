---
name: optimize-worktrees
description: >-
  Reuse Rust build outputs across local Fedi worktrees instead of compiling the whole dependency graph per worktree.
  Use even when the user only asks to open a worktree or work on an issue, without mentioning caching.
  Does not apply to CI.
---

# optimize worktrees

## enter the worktree shell before the first cargo command

from the worktree root, run every cargo or just command through the worktree shell:

```bash
nix develop .#worktree --command cargo build --all-targets
```

or enter `nix develop .#worktree` once for an interactive session. the default `nix develop` shell builds normally and seeds nothing.

entering the worktree shell runs `dev/worktree-cache.py`. on macOS it seeds this worktree's `target-nix/debug` from the most complete build on the machine that used the same rustc and the same `.cargo/config.toml`, using APFS clones. the clones share disk blocks with the donor, so a worktree costs only what it compiles itself: the workspace crates, plus whatever its `Cargo.lock` changed. a cargo command run outside the shell, or before the shell has run once, compiles everything from scratch into a directory nothing else can share.

the worktree shell prints one line on entry: `worktree cache: reused host dependencies from <path>: <files>, <GiB> shared, <seconds>`, or one line saying why nothing was reused. read it before the first build.

## one command shape per worktree

cargo keys every artifact by the exact feature set and profile it was built with. each new shape compiles and stores its own copy of the dependency graph, so a worktree that mixes shapes holds several copies and shares little with its donor. use the shapes the repo scripts use, and nothing else:

| task | command |
| --- | --- |
| compile everything | `just build` (`cargo build --all-targets`) |
| type check | `just check` (`cargo check --all-targets`) |
| lint | `just clippy` (`cargo clippy --all-targets`) |
| bridge tests | `scripts/test-bridge.sh`, or `cargo nextest run --cargo-profile dev -E 'package(fedi-ffi)'` after `just build` |
| one test | the same nextest command with `-E 'test(<name>)'` |

run `just build` first. after it, nextest compiles nothing. clippy and check each add about 2 GiB of their own check artifacts and finish in under two minutes.

do not use: `-p` or `--package` subsets, `--lib`, `--bin`, `--tests` on their own, `--release`, `--profile <other>`, `--features`, `--no-default-features`, `--manifest-path`, `CARGO_PROFILE_*` variables, or `cargo test` where the repo uses nextest. each one is a new shape that compiles the dependency graph again into this worktree.

## disk

- the worktree shell points cargo at `target-nix/` inside the worktree. a cargo run outside any dev shell writes to `target/` and reuses nothing. a cargo run in the default shell compiles everything into `target-nix/` from scratch.
- deleting a worktree frees only what it compiled itself. donors keep their blocks.
- do not `cargo clean` to force reuse or to reclaim space. `target-nix/datadir` and other runtime data live beside the build output.
- `FEDI_WORKTREE_CACHE=0` disables seeding. leave CI workflows and their shell selection alone.
