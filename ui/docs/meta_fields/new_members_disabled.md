# `fedi:new_members_disabled`

Boolean value that prevents new members from joining the federation

Use this as a measure to restrict access the federation.

When set, new members who scan the federation invite will be able to preview the federation information, but they will not be able to join. You can use this together with [`fedi:invite_codes_disabled`](invite_codes_disabled.md) to reduce the virality of this federation.

Be aware that users can still join the federation using some other client that disregards this meta field. This field only applies to users joining using the latest version of the Fedi app.

## Structure

(stringified) boolean

```json
"fedi:new_members_disabled": "true" // defaults to "false"
```
