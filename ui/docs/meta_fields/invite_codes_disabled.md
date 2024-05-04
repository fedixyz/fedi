# `fedi:invite_codes_disabled`

Boolean value that blocks access to the federation invite code

Use this as a limited constraint on the virality of the federation code.

When set, the QR code & copiable string will never be displayed to the user after joining.

Be aware that users can still save the invite code before joining and share it with other. For a stronger constrain use [`new_members_disabled`](new_members_disabled.md)

## Structure

(stringified) boolean

```json
"fedi:invite_codes_disabled": "true" // defaults to "false"
```
