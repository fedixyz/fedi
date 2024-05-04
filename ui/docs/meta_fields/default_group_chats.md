# `fedi:default_group_chats`

Stringified JSON array of strings representing the IDs of any chat groups that all users will join automatically upon creating their username

Use this to make sure all users who join the federation can immediately see at least one universal chat group instead of a blank Chat screen

The group ID can be found by copying the invite code of any public or broadcast only chat groups and stripping the `fedi:group:` prefix

Chat Group invite code: `fedi:group:vdvydmteqmn_pby9uulhdrzd`
Group ID: `vdvydmteqmn_pby9uulhdrzd`

Be careful not to provide duplicate IDs in this array or the app misbehave

## Structure

(stringified) Array of strings

```json
"fedi:default_group_chats": "[\"m9rpczfb7jsmu-9oi7g7zp1y\",\"vdvydmteqmn_pby9uulhdrzd\"]"
```
