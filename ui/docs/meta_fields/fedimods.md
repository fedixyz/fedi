# `fedi:fedimods`

(formerly `sites`)

Stringified JSON array of objects representing the default FediMods shown to users upon joining the federation

Use this to make sure all users who join the federation can immediately see at least one FediMod on the Home screen

If not set, a hard-coded default list of common FediMods will be shown

This FediMod UI consists of an title, icon, and URL. Every object in this array should strictly follow the structure below.

- `id` (string)
- `title` (string)
- `imageUrl` (string)
- `url` (string)

Be careful to make sure this value is perfectly stringified or the app may misbehave.

## Structure

(stringified) Array of FediMod objects

```json
"fedi:fedimods": "[{\"id\":\"mutinynet-faucet\",\"title\":\"Get test sats\",\"url\":\"https://faucet.mutinynet.dev.fedibtc.com/\"},{\"id\":\"product-feedback\",\"title\":\"Feedback\",\"url\":\"https://docs.google.com/forms/d/e/1FAIpQLSfP8WgwSOhzcYSlbzaoH7-SAzlE8Swyu9t8rWEkPzJuG9AR2w/viewform\"},{\"id\":\"fedi-community\",\"title\":\"Fedi Telegram\",\"url\":\"https://t.me/fedibtc\"},{\"id\":\"btcmap\",\"title\":\"BTCMAP\",\"url\":\"https://btcmap.org/map\"}]"
```
