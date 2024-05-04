# `fedi:offline_wallet_disabled`

Boolean value that disables offline ecash generation features

Use this to restrict access to animated QR codes being shared.

Note that chat payments will still use ecash generation to send payments. This field only affects the UI for displaying animated QR codes to transfer ecash.

## Structure

(stringified) boolean

```json
"fedi:offline_wallet_disabled": "true" // defaults to "false"
```
