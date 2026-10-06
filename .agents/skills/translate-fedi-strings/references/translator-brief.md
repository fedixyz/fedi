# Translator brief

Hand this file to each translation subagent, with the locale, the path to its rows, the output path, and the terms settled for the locale.

## Context

Fedi is a mobile and web Bitcoin wallet with chat. Users join federations: community-run custodians, operated by guardians, that hold bitcoin for their members as ecash. Users can also create their own Federation, pay guardians for seats, and attach a Liquidity Provider that runs a Lightning gateway. Spaces and communities are group chats with Mini Apps. Stable Balance holds a dollar value.

## Inputs

- English source, read only: `ui/common/localization/en/common.json`.
- The locale's file, read only: `ui/common/localization/<locale>/common.json`. It is the reference for terminology and register.
- Your rows. Each has `key`, `reason` and `english`. Stale rows also carry `previousEnglish` and `current`, the existing translation of the older English.

Write one flat JSON object that maps every row's key to its translation. Do not edit files in the repository.

## Rules

1. Translate every row. The output keys are exactly the row keys.
2. Keep every `{{placeholder}}` exactly, including its name. Keep every `<tag>`, `</tag>` and `<icon />` exactly, placed around the translated words that belong inside it. Keep `\n` line breaks where English has them.
3. Use the settled terms. For any other recurring term, find keys whose English contains it, read how the locale file renders it, and reuse that rendering.
4. For a stale row, make the smallest edit that brings `current` in line with `english`, and keep the rest of the wording. Compare `previousEnglish` with `english` to see what changed.
5. Match the locale file's register: the same form of address and the same short, plain UI style. Do not add words or explanations the English does not have.
6. Names stay as written: Fedi, Manifold, PeerBadge, G-Bot, Fedimint, Nostr.
7. Where the locale file deliberately leaves a word in English, do the same. Otherwise translate. Never leave the English sentence in place of a translation.
8. Never use an em dash or an en dash character. Where English has one, use a comma, a colon or two sentences.

## Report

Reply in under 200 words: the file you wrote, how you rendered each settled term, and any key where the English was ambiguous and which meaning you picked.
