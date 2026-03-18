⚠️ Docs are AI-generated. Please review with caution ⚠️

# Common UI

Contains code shared between the PWA and React Native apps.

## Deep Linking (Common)

Our deeplinking logic is explained in detail in the [Deep Linking Guide](./deep-linking.md).

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
