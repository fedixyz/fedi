# `fedi:autojoin_communities`

Stringified JSON array of space invite codes that members join automatically.

Wallet-service settings use this field for the spaces that members should join by default. The app also accepts the historical typo `fedi:autojoin_communities:` when reading federation metadata.

Use an empty array to clear the list.

## Structure

(stringified) Array of strings

```json
"fedi:autojoin_communities": "[\"fedi:community1example\",\"fedi:community1another\"]"
```
