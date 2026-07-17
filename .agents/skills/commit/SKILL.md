---
name: commit
description: Use when creating commits, amending commits, or proposing commit messages.
user-invocable: true
---

# Commit message skill

Write commit messages that follow this user's established conventions

Follow the principles in [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) as a general baseline but respect the Rules below as a higher priority.

## Rules

### Run lint and format before committing
Before creating any commit, run the checks described in the `lint-and-format` skill. If either check fails, fix the issues and stage the fixes before committing. Never commit code that hasn't passed both checks.

### Never add a Co-Authored-By footer
No commit should contain a `Co-Authored-By` line. Never append one, even if the default behavior suggests it.

### Subject line format
Use conventional commits: `type(scope): lowercase description`

- **type**: `feat`, `fix`, `build`, `chore`, `doc`, `refactor`, `test`

| type | when to use |
|------|-------------|
| `feat` | new user-facing functionality or capability |
| `fix` | bug fix |
| `build` | build scripts, deploy scripts, dockerfiles, CI/CD, pipelines, dependency additions/upgrades |
| `chore` | config files, env var scaffolding, tooling setup, non-functional changes |
| `refactor` | restructuring code without changing behavior |
| `test` | adding or updating tests |
| `docs` | documentation only |

- **scope**: the area of the codebase affected - use short, recognizable labels that accurately represent the specific codebases unique components. If you do not have enough context about the particular codebase to propose a useful scope you may omit it.
- **Target 68 characters, hard limit 80** for the entire subject line (including `type(scope): `). Aim for 68 first; if a clean wording lands between 69 and 80, take it rather than mangling the meaning. Over 80, shorten: drop the scope, use a shorter verb, abbreviate the noun, or describe at a higher level. The body is where detail goes, not the subject
- Use lowercase after the colon
- Use active voice: "add", "update", "extend", "configure" - not "added" or "adds"

### Body format
- Blank line after subject
- Bullet points with `-` prefix, lowercase
- Focus on motivation, tradeoffs, and non-obvious context rather than restating what the diff shows. File and function names are fine when they communicate important context, but avoid mechanically listing every touched file or renamed symbol
- Use sub-bullets (indented `-`) for grouped details under a single point
- Counts (of files, tests, assertions, lines) are noise - they're visible in the diff and go stale if the commit is amended. Describe what is covered or why it matters instead
- Don't describe routine cleanup that any competent reviewer would have done the same way - if the only reasonable action was the obvious one, it doesn't need a bullet
- Keep bullets terse - fragments are fine, no periods at end

### Atomic commits

A good commit is a **package** that contains a cohesive idea and everything needed to understand that idea. The goal is commits that a reviewer can reason about in isolation, that can be cherry-picked cleanly, and that tell a clear story when read in sequence.

**What belongs together:**
- Each commit should be a coherent, self-contained unit of work - one logical change, not one file
- A function and its tests can share a commit if the function is meaningless without the test (and vice versa)
- It is perfectly acceptable to combine types when there is a cohesive purpose (e.g. `refactor+fix`: restructure a module to fix a bug that lived in the old structure)

**What should be separate:**
- Documentation files (`.md`, `.html`) that are not tightly coupled to the code change - don't bundle planning docs, guides, or changelogs into code commits
- Unrelated fixes discovered along the way - extract them into their own commit rather than smuggling them in with the feature
- Lint/format fixes should not be separate commits - code should be correctly formatted when first introduced; if a prior commit has an error, amend it directly

**Extracting notable sub-features for review clarity:**
When a large changeset contains sub-features that represent distinct design decisions, extract them into their own commits even if they share the same scope. A reviewer approaching a PR cold - with no prior context - should be able to evaluate each decision independently. To identify these, imagine reading the diff for the first time: any piece that would make a reviewer stop and ask "wait, why is this here?" or "is this the right design?" is a candidate for extraction, provided its diff can be applied cleanly (use intermediate file states if needed). The goal is to reduce cognitive load per commit, not to minimize commit count.

**The test:** if you can't describe the commit in one short sentence without using "and" to join unrelated ideas, it should probably be two commits or the sentence should describe a higher-level / more broadly encapsulating idea.

### Commit ordering on a branch

Commits on a branch should read like a narrative of how the work was built up. Each commit should compile and make sense on its own, and the sequence should follow the dependency chain so that a reviewer reading top-to-bottom (oldest first) can build a mental model incrementally.

Guiding principles:
- **Foundation first** - infrastructure, schema changes, and config before the code that depends on them. Definitions (build targets, schemas, environment config) are foundation - application code that references those definitions comes after. Downstream consumers like CI pipelines and deployment jobs can follow later as their own scope
- **Refactor before feature** - if you need to restructure existing code to make room for new behavior, do that in a prior commit so the feature commit only contains new logic. However, a refactor that introduces references to not-yet-defined things must come after the commit that defines them
- **Plumbing before porcelain** - internal wiring and glue before the user-facing surface
- **Each commit should be a valid resting point** - a reviewer should be able to stop at any commit and see a codebase that makes sense, even if incomplete
- **Staging intermediate states is okay** - when crafting commit history, it is fine to commit a file in a simpler or earlier form so it fits logically in a foundational commit, then evolve it in a later commit. This produces cleaner diffs and better narrative. However, the final commit on the branch must always match the intended end state - never let history-crafting accidentally alter the final result

## Examples

Single-purpose commit:
```
feat(auth): add password reset endpoint

- validates token expiry before allowing reset
- hashes new password and invalidates all existing sessions
```

Combined type:
```
refactor+fix(cart): simplify price calculation to fix rounding errors

- replace per-item rounding with single final-total round
- extract tax computation into pure function for testability
```
