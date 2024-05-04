# `fedi:tos_url`

A URL presented to the user before joining the federation

Use this field to inform the user of any terms and conditions to expect upon joining the federation.

When set, all members who attempt to join this federation will first be prompted with a Terms of Service screen displaying this URL as a clickable link.

Only after accepting the terms will the user proceed to join the federation

## Structure

Standard HTTP/S URL

```json
"fedi:tos_url": "https://www.fedi.xyz/ts-demo"
```
