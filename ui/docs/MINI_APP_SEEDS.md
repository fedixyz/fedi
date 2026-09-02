# Mini App Seeds

Native mini apps can request an app-specific seed from `window.fediInternal`. The API is available only when the `mini_app_seed` feature is enabled.

## API

Detect the feature before showing any seed-dependent functionality:

```js
if (typeof window.fediInternal?.getSeed === 'function') {
    const { seed } = await window.fediInternal.getSeed()
}
```

`getSeed()` returns `{ seed: string }`. `seed` is lowercase hex encoding of 16 bytes. Each request requires user approval and can be denied.

## Recovery contract

Derivation is deterministic. Wallet recovery restores the app seed for the same origin. The app seed is the mini app's only durable secret: derive identity and encryption keys from it. After local data loss, re-request the seed and re-derive those keys. Do not rely on a cached derived key as the only copy.

Do not display or log the seed. Keep it in memory only as long as derivation needs it.

## Origin identity

The web origin is the app identity. Paths do not create separate identities. Moving the app to another domain gives it a new seed, even when the code is unchanged.

## Page script access

Any script running in the page can call `getSeed` and read the response after approval. This includes analytics, tag managers, compromised dependencies, and injected third-party scripts. Control every script in the page. Prefer bundled, pinned code and a restrictive Content Security Policy.

## Difference from `window.nostr`

`window.nostr` exposes the user's global Fedi Nostr identity and signs through Fedi. A Nostr identity derived from `getSeed` is private to the mini app's origin. The keys are different and must not be treated as interchangeable.
