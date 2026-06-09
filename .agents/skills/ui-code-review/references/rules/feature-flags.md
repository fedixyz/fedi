# Feature flags

How flags are defined and consumed (the runtime feature definitions, the web feature API, the selectors) lives in the `feature-flags` skill.

In review, check:

- gated UI reads the flag through the feature-flag selectors, not an ad-hoc or duplicated check
- the flag-OFF path reproduces prior behavior exactly, since these flags flip server-side and flag-off is what ships until the flip
- a live control behind a flag is never wired to the wrong action, and anything wrong that moves funds blocks
