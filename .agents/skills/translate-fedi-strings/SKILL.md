---
name: translate-fedi-strings
description: >-
  Sweep the Fedi app's UI strings into every locale in one PR. Translates keys that exist only in English and updates translations whose English changed since the last sweep, under ui/common/localization. Triggers on: translate fedi strings, translate strings, translation sweep, i18n sweep, missing translations, stale translations.
user-invocable: true
---

# Translate Fedi strings

Feature PRs add and change strings in `ui/common/localization/en/common.json` only. A sweep PR made with this skill later brings every other locale file in line with English on master. Keeping translations out of feature PRs keeps their diffs small and lets one reviewer check a language in one place.

This skill covers the app's UI strings. Store release notes are translated by the release skills (`ios-release`, `android-release`, `report-next-release`).

## How i18n works here

- **Locales:** `ui/common/localization/index.ts` lists them in `resources` and `i18nLanguages`. Each one is `ui/common/localization/<locale>/common.json`, a nested object with top-level groups `words`, `phrases`, `errors` and `feature`. Native and web resolve keys through i18next with `fallbackLng: 'en'`, so a key missing from a locale shows English.
- **English is the source.** A sweep never edits `en/common.json`. Its key order is maintained by hand, so never run it through a formatter. If an English string reads wrong, say so in the PR body.
- **Other locale files** are written by `formatLanguageJson` in `ui/common/scripts/i18n-utils.ts`, which sorts keys. Always write them through the sweep script, never by hand.
- **Markup inside values:** `{{name}}` placeholders, `<tag>...</tag>` and `<icon />` elements rendered by `Trans`, and `\n` line breaks. A translation keeps every one of them exactly.
- **iOS permission prompts:** the `feature.permissions.purposeStrings` keys feed each locale's `InfoPlist.strings` through `yarn i18n:sync-plist`, which also maps locale codes to iOS ones.
- **Locales with less obvious codes:** `ara` is Juba Arabic written in Latin script, separate from `ar`. `rn` is Kirundi and `rw` is Kinyarwanda. `tl` is Tagalog and `my` is Burmese.

## How the sweep finds work

`ui/common/localization/translation-baseline.json` records the English that every locale was last brought in line with. The commit that last wrote it is the last sweep. `yarn i18n:sweep report`, run in `ui/common`, compares each locale against it and sorts keys into four groups:

| group | meaning | what the sweep does |
|---|---|---|
| missing | the key is absent from the locale or empty | translate it |
| stale | the locale value is unchanged since the last sweep and the English has changed since. The row carries `previousEnglish` and `current` | update the translation to the new English |
| copied | the value was added after the last sweep and is the English text itself, usually pasted in by a feature PR | translate it, unless the locale deliberately keeps that word in English |
| remove | the key no longer exists in English | `finish` deletes it |

A locale value that changed after the last sweep counts as current. That is how the script respects a translation a person made between sweeps. A locale can also carry entries under `stale` in the baseline file: they are keys known to have been translated from older English, and they appear as stale rows until a sweep updates them.

The report needs history back to the last sweep commit. It refuses to run when a shallow clone cuts that commit off.

## Run a sweep

1. Start a branch from the latest `origin/master` in a fresh worktree, then run `yarn i18n:sweep report <scratch dir>/work.json` in `ui/common`. The table prints counts per locale, and the file holds every row. If every count is zero, stop: there is nothing to sweep.
2. Settle terminology before you split the work. For each locale, list the recurring terms in the rows (federation, guardian, ecash, community, space, Stable Balance, fee names, and any new product term) and find how the locale file already renders each one. When English renames a concept, the stale rows carry the rename. Use the locale's rendering of the new name, and never keep the retired one.
3. Translate. Give each locale to its own subagent with `references/translator-brief.md`, the locale's rows, and the terms from step 2. Split a locale with more than about 400 rows into chunks that share the same terms. Each subagent writes a flat JSON object of key to translation.
4. Merge the outputs into one file shaped `{ "<locale>": { "<key>": "<translation>" } }` and run `yarn i18n:sweep apply <file>`. It rejects a key that is not in the work list and checks placeholders, tags and line breaks. If anything fails, it writes nothing and lists every problem.
5. Run `yarn i18n:sweep finish`. It fails while missing or stale rows remain. Then it deletes the keys English no longer has and rewrites the baseline to the current English with no stale entries.
6. If any `purposeStrings` value changed, run `yarn i18n:sync-plist` and commit only the `InfoPlist.strings` files whose strings changed.
7. Run `yarn prettier --check` on the changed files. The diff holds locale files, the baseline, and any `InfoPlist.strings`. It holds no English and no code.

## Rules

- **Only the work list changes.** A value outside the report is either current or a person's work. Do not rewrite it for style, consistency or a better word, even when it looks wrong. If a term conflicts across the file, for example an older batch still uses a retired name, name the keys in the PR body so a person can decide.
- **Stale rows get the smallest edit.** Change what the English change requires and keep the rest of the existing wording.
- **Names stay as written:** Fedi, Manifold, PeerBadge, G-Bot, Fedimint and Nostr. Write Lightning, Bitcoin, ecash and sats the way the locale file already does.
- **No em dash or en dash characters.** Use a comma, a colon or two sentences.

## The PR

One PR per sweep. The body gives a table of missing, stale, copied and removed counts per locale. It also lists the terms settled in step 2 for each locale, and any conflict or English problem a person should look at. Reviewers who read a language can check it without reading the others.
