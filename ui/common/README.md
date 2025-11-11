⚠️ Docs are AI-generated. Please review with caution ⚠️

# Common UI

Contains code shared between the PWA and React Native apps.

## Deep Linking (Common)

Utilities to detect, normalise, parse, and queue deep links across platforms.
Works with both **Universal Links** (`https://app.fedi.xyz/link?...`) and **fedi://** links.

### Constants

-   Hosts & paths → [`constants/linking.ts`](./common/constants/linking.ts)

    -   `DEEPLINK_HOSTS`, `LINK_PATH`, `TELEGRAM_BASE_URL`, `WHATSAPP_BASE_URL`

### Detection & conversion

-   **isUniversalLink(raw)** → [`utils/linking.ts`](./common/utils/linking.ts)

    -   True when host matches our UL hosts and the path equals `LINK_PATH`, with `screen=` in query or hash.
    -   **Notes:** Accepts both `?screen=...` and `#screen=...` forms.

-   **universalToFedi(raw)** → [`utils/linking.ts`](./common/utils/linking.ts)

    -   Converts UL to `fedi://<screen>/<id?>` (decodes `id`). Returns `''` on invalid input.

-   **decodeFediDeepLink(uri)** → [`utils/linking.ts`](./common/utils/linking.ts)

    -   Normalises percent-encoding of `fedi://` paths (decodes each path segment).

### Parser

-   **parseDeepLink(uri, validScreens)** → [`utils/linking.ts`](./common/utils/linking.ts)

    -   Returns `ParsedDeepLink` with:

        -   `screen`, optional `id`
        -   `isValid` (screen is in `validScreens`)
        -   `originalUrl` and (when applicable) `fediUrl`

    -   **Notes:** Converts universal → fedi first; validates against the screen set derived from the nav config.

-   **getValidScreens(screens)** → [`utils/linking.ts`](./common/utils/linking.ts)

    -   Traverses nested React Navigation config to collect valid first-path segments.

-   **isFediDeeplinkType(url)** → [`utils/linking.ts`](./common/utils/linking.ts)

    -   True if URL should be specially handled (Telegram, WhatsApp, or our UL hosts).

### URI helpers

-   `isFediUri(uri)`, `stripFediPrefix(uri)`, `prefixFediUri(path)`
-   `parseFediPath(uri)` → `{ screen, id? }`
-   `joinFediPath(screen, id?)` → `'fedi://<screen>/<id?>'`
-   `parseFediUri(uri)` → `Result<{ screen, id? }, Error>`

    -   **Notes:** Safer parsing with `neverthrow` for callers that want explicit error paths.

### Bridging handler

-   **setDeepLinkHandler(handler)** → [`utils/linking.ts`](./common/utils/linking.ts)

    -   Native registers a callback that common will use to deliver pending links.
    -   **Notes:** Keeps the common layer platform-agnostic while allowing native to drive navigation.

### PIN-aware queue

-   **PinAwareDeepLinkQueue** → [`utils/linking.ts`](./common/utils/linking.ts)

    -   `add(url)` queues; `flush()` returns and clears; `size()` / `clear()`
    -   `setNavigationReady()` and `setAppUnlocked(unlocked)` mark readiness
    -   Internally calls `processPendingDeepLinks(...)` once **both** navigation and PIN are ready.
    -   **Notes:** Uses a small timeout to accommodate slow device initialisation before dispatching; delivered to the registered `setDeepLinkHandler` callback.

### Types

-   **Linking types** → [`types/linking.ts`](./common/types/linking.ts)

    -   `ScreenConfig`, `ParsedDeepLink`, `NavigationParams`, `NavigationAction`
    -   **Notes:** Shared between layers; keep in sync with the native navigation map.

---

## Zendesk (Common)

This section is the **single source of truth** for Zendesk **Redux state**, **actions/selectors**, and **JWT details** used by all apps. For native wiring (env, UI flows, hooks, push taps), see the **Native README**.

### Redux Slice

-   **File** → [`common/redux/support.ts`](./common/redux/support.ts)

#### State (relevant to Zendesk)

```typescript
{
    supportPermissionGranted: boolean
    zendeskInitialized: boolean
    zendeskPushNotificationToken: string
    zendeskUnreadMessageCount: number
}
```

#### Actions

-   `setSupportPermission`, `setZendeskInitialized`
-   `setZendeskPushNotificationToken`, `setZendeskUnreadMessageCount`
-   `resetSurveyTimestamp`, `setCanShowSurvey`, `setSurveyUrl`

#### Selectors

-   `selectSupportPermissionGranted`, `selectZendeskInitialized`
-   `selectZendeskPushNotificationToken`, `selectZendeskUnreadMessageCount`

#### Persistence

-   `loadFromStorage` hydrates state on startup

#### Convenience Dispatchers

-   `grantSupportPermission()`
-   `saveZendeskPushNotificationToken(token)`
-   `updateZendeskUnreadMessageCount(count)`

> **Notes:** Common owns **state shape** and **APIs**; platform layers should call these rather than writing state directly.

### Token & Authentication

#### JWT Generation

Generated in **native**; validated/consumed by services that read common state.

**Header:**

```json
{
    "alg": "HS256",
    "typ": "JWT",
    "kid": "ZENDESK_KID"
}
```

**Claims:**

-   `external_id`: user npub
-   `scope`: `ZENDESK_USER_SCOPE`
-   `name`: display name

**Signing:** `ZENDESK_SECRET_KEY` (Base64URL, no padding)

#### Display Name

Fallback to **"Fedi User"** when Matrix display name is missing/placeholder.

### Permissions

-   Grant via `grantSupportPermission()`; persisted in Redux.
-   Without permission, **native** should route to Help Center instead of opening chat.

### Unread Count Management

-   Updated by a **native polling hook** (platform decides schedule).
-   Consumed by UI (e.g., the "Ask Fedi" badge).
-   Selector: `selectZendeskUnreadMessageCount`.

### Push Notifications

-   Token stored in Redux via `setZendeskPushNotificationToken(token)`.
-   Selector: `selectZendeskPushNotificationToken`.
-   **Native** is responsible for forwarding FCM/APNs to Zendesk; Redux mirrors token/state for UI.

### Development Notes

-   Configure all required environment variables in platform apps.
-   CI/CD should inject secrets; **no plaintext secrets** in the repo.
-   Permission flow must complete before launching Zendesk chat.
-   Once permission is granted, unread count updates are driven by the **native** layer.
