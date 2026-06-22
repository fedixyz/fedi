# `federation_expiry_timestamp`

An unprefixed Fedimint metadata field that the Fedi app treats as an expiration timestamp for the federation. It follows the same timestamp format and client behavior as [`fedi:popup_end_timestamp`](popup_end_timestamp.md): after the timestamp passes, the app blocks access to this federation except for leaving it or switching to another federation.

This field is checked as a compatibility alias for `popup_end_timestamp`; prefer `fedi:popup_end_timestamp` for Fedi-specific federation metadata when possible.

Auto-select federation discovery also uses this value. Federations whose expiry timestamp is less than 30 days away are filtered out of auto-select results so new users are not routed into expiring federations.

## Structure

Base 10 encoded string containing a UNIX timestamp in seconds.

```json
"federation_expiry_timestamp": "1696312799"
```
