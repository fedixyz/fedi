# Deep Linking

## Overview

The deep linking system routes external URLs to specific screens in the native app. Two link formats:

-   **Universal Links** — `https://app.fedi.xyz/link?screen=...`. Users tap these; the web handles them at [`/link`](../web/src/pages/link.tsx).
-   **Internal links** — `fedi://screen?...`. The native app routes on these directly. Universal links are normalized to this form via [`normalizeDeepLink`](../common/utils/linking.ts).

Onboarding must complete before a deeplink routes. Pending links are stashed in Redux (`redirectTo` in [`environment.ts`](../common/redux/environment.ts)) and replayed by [`Splash.tsx`](../native/screens/Splash.tsx). The universal-link host allowlist lives in [`DEEPLINK_HOSTS`](../common/constants/linking.ts).

---

## User Flow Diagram

The diagram below traces every path a user can take when tapping a Fedi deep link — from initial tap through app resolution, routing, and final destination.

```mermaid
flowchart TD
    START([User taps a Fedi link]) --> FORMAT{Link format?}

    FORMAT -->|"Universal Link<br/>(app.fedi.xyz/link?...)"| HAS_APP{App installed?}
    FORMAT -->|"fedi:// protocol"| HAS_APP_2{App installed?}

    HAS_APP_2 -->|No| DEAD["Link fails<br/>(OS cannot handle scheme)"]
    HAS_APP_2 -->|Yes| ONBOARDED

    %% ─── App NOT installed ───────────────────────
    HAS_APP -->|No| LANDING["<b>/link page</b>"]
    LANDING --> SCHEME_OK{App opened?}
    SCHEME_OK -->|Yes| ONBOARDED
    SCHEME_OK -->|No| STORE[App Store / Play Store]
    STORE --> OPENS[User installs and opens app]
    OPENS --> FRESH_ONBOARD["<b>Onboarding splash</b><br/>shows DeepLinkRedirectLink"]
    FRESH_ONBOARD --> RESUME["<b>/deeplink-redirect page</b>"]
    RESUME --> RESUME_OK{Persisted link found?}
    RESUME_OK -->|Yes| ONBOARDED
    RESUME_OK -->|No| RESUME_ERR(["<b>Error UI</b><br/>'Back to Fedi' CTA"])

    %% ─── App installed ──────────────────────────
    HAS_APP -->|Yes| ONBOARDED

    ONBOARDED{Onboarding<br/>complete?}
    ONBOARDED -->|No| STASH[Link saved to storage]
    STASH --> FINISH_OB[User completes onboarding]
    FINISH_OB --> REPLAY[Saved link replayed]
    REPLAY --> ROUTE

    ONBOARDED -->|Yes| ROUTE

    %% ─── Routing ─────────────────────────────────
    ROUTE{"Screen specified<br/>in link?"}

    ROUTE -->|"home / chat /<br/>wallet / mods"| END_TAB(["<b>Tab Screen</b>"])
    ROUTE -->|room| END_ROOM(["<b>Chat Room</b>"])
    ROUTE -->|user| END_DM(["<b>Direct Message</b>"])
    ROUTE -->|browser| END_BROWSER(["<b>FediMod Browser</b>"])
    ROUTE -->|share-logs| END_LOGS(["<b>Share Logs</b>"])
    ROUTE -->|ecash| EC_SCREEN
    ROUTE -->|join| J_SCREEN
    ROUTE -->|join-then-ecash| JE_SCREEN
    ROUTE -->|join-then-browse| JB_SCREEN

    %% ─── Claim Ecash ────────────────────────────
    subgraph ecash_flow ["Claim Ecash"]
        EC_SCREEN["<b>Claim Ecash Screen</b>"]
        EC_SCREEN --> EC_VALID{Token valid?}
        EC_VALID -->|No| EC_ERROR["<b>Invalid Token Error</b>"]
        EC_ERROR -->|Cancel| EC_HOME_1(["<b>Home</b>"])

        EC_VALID -->|Yes| EC_MEMBER{Already in<br/>issuing federation?}
        EC_MEMBER -->|Yes| EC_EXISTING["Shows amount<br/><i>Adding to existing wallet</i>"]
        EC_MEMBER -->|No| EC_NEW["Shows amount<br/><i>Adding to new wallet</i><br/>+ Terms of Service"]

        EC_EXISTING --> EC_ACT{User action}
        EC_NEW --> EC_ACT
        EC_ACT -->|Claim| EC_CLAIMED["Ecash received<br/>(auto-joins federation<br/>if not already a member)"]
        EC_ACT -->|Maybe Later| EC_HOME_2(["<b>Home</b>"])
        EC_CLAIMED --> EC_SUCCESS["<b>Ecash Claimed!</b>"]
        EC_SUCCESS -->|Go to Wallet| EC_WALLET(["<b>Wallet</b>"])
        EC_SUCCESS -->|Maybe Later| EC_HOME_3(["<b>Home</b>"])
    end

    %% ─── Join Federation ─────────────────────────
    subgraph join_flow ["Join Federation"]
        J_SCREEN["<b>Join Federation Screen</b>"]
        J_SCREEN --> J_MEMBER{Already<br/>a member?}
        J_MEMBER -->|Yes| J_TOAST["<i>Already joined</i> toast"]
        J_TOAST -->|Tap back| J_PREV(["Previous screen"])

        J_MEMBER -->|No| J_PREVIEW["<b>Federation / Community Preview</b><br/>name, logo, details"]
        J_PREVIEW --> J_ACT{User action}
        J_ACT -->|Confirm join| J_JOINED[Joined]
        J_ACT -->|Reject| J_REJECT(["Previous screen"])

        J_JOINED --> J_NAME{Display name<br/>already set?}
        J_NAME -->|Yes| J_DEST(["<b>Wallet</b> (federation)<br/>or <b>Home</b> (community)"])
        J_NAME -->|No| J_DISPLAY["<b>Enter Display Name</b>"]
        J_DISPLAY --> J_DEST
    end

    %% ─── Join + Claim Ecash ──────────────────────
    subgraph join_ecash_flow ["Join + Claim Ecash"]
        JE_SCREEN["<b>Join Federation Screen</b><br/>(ecash token queued)"]
        JE_SCREEN --> JE_MEMBER{Already<br/>a member?}

        JE_MEMBER -->|"Yes — skip join"| JE_EC_SCREEN
        JE_MEMBER -->|No| JE_PREVIEW["<b>Federation Preview</b>"]
        JE_PREVIEW --> JE_ACT{User action}
        JE_ACT -->|Confirm join| JE_JOINED[Joined]
        JE_ACT -->|Reject| JE_BACK(["<b>Home</b>"])

        JE_JOINED --> JE_EC_SCREEN
        JE_EC_SCREEN["<b>Claim Ecash Screen</b><br/>(token pre-loaded)"]
        JE_EC_SCREEN --> JE_CLAIM{User action}
        JE_CLAIM -->|Claim| JE_OK["<b>Ecash Claimed!</b>"]
        JE_CLAIM -->|Maybe Later| JE_HOME(["<b>Home</b>"])
        JE_OK -->|Go to Wallet| JE_WALLET(["<b>Wallet</b>"])
    end

    %% ─── Join + Browse ───────────────────────────
    subgraph join_browse_flow ["Join + Browse"]
        JB_SCREEN["<b>Join Federation Screen</b><br/>(URL queued)"]
        JB_SCREEN --> JB_MEMBER{Already<br/>a member?}

        JB_MEMBER -->|"Yes — skip join"| JB_BROWSER
        JB_MEMBER -->|No| JB_PREVIEW["<b>Federation Preview</b>"]
        JB_PREVIEW --> JB_ACT{User action}
        JB_ACT -->|Confirm join| JB_JOINED[Joined]
        JB_ACT -->|Reject| JB_BACK(["<b>Home</b>"])

        JB_JOINED --> JB_BROWSER
        JB_BROWSER(["<b>FediMod Browser</b><br/>(URL pre-loaded)"])
    end
```

---

## How It Works

### Link Processing

All links go through the same pipeline regardless of entry point:

```
Incoming URL
     │
     ├─ isDeepLink()?  →  Yes → normalizeDeepLink()  →  fedi://screen?params
     │                     No  → pass through as-is
     ▼
getLinking().subscribe()
     │
     ├─ Onboarding incomplete?  →  stash in Redux, replay after onboarding
     ▼
getInternalLinkRoute()  →  look up screen in screenMap  →  NavigationState
```

The native pipeline (subscribe, route, `screenMap`, `patchLinkingOpenURL`) lives in [`utils/linking.ts`](../native/utils/linking.ts). Parsing helpers (`isDeepLink`, `normalizeDeepLink`, `stripFediPrefix`, `normalizeCommunityInviteCode`) are in [`common/utils/linking.ts`](../common/utils/linking.ts).

**Entry points** — all wired in [`Router.tsx`](../native/Router.tsx):

-   **Cold start** — `Linking.getInitialURL` and `notifee.getInitialNotification`. Links arriving before nav mounts are queued in `pendingLinks` and flushed on `onReady`.
-   **Foreground** — `Linking.addEventListener`.
-   **Notification** — Notifee's `onForegroundEvent` pulls the `link` field from the notification data payload.
-   **In-app** — `patchLinkingOpenURL` intercepts `Linking.openURL` so deep links route internally instead of opening a browser.

### Deep Link → Internal Link Conversion

[`normalizeDeepLink`](../common/utils/linking.ts) converts a universal link to the internal format. The `screen` param becomes the path; everything else passes through:

```
https://app.fedi.xyz/link?screen=room&roomId=abc123  →  fedi://room?roomId=abc123
```

Both `?` and `#` delimiters are supported.

### Post-install Fallback (Web)

When a tapped universal link finds no installed app, the web preserves it across the install detour:

-   [`/link`](../web/src/pages/link.tsx) writes the URL to `localStorage` via [`setPendingDeeplink`](../web/src/utils/localstorage.ts) and attempts the `fedi://` scheme.
-   After install, [`/deeplink-redirect`](../web/src/pages/deeplink-redirect.tsx) reads and clears the entry, then re-fires the scheme.
-   The native [`DeepLinkRedirectLink`](../native/components/ui/DeepLinkRedirectLink.tsx) — shown on the onboarding splash when the user has no joined federations or non-global communities — opens the system browser to [`getDeeplinkResumeUrl`](../common/constants/api.ts), bridging the user back to `/deeplink-redirect`.

Layout primitives shared by both web pages live in [`DeeplinkPageLayout.tsx`](../web/src/components/DeeplinkPageLayout.tsx).

---

## Supported Routes

Routes are defined in `screenMap` in [`utils/linking.ts`](../native/utils/linking.ts). Each key is a screen name (e.g. `"room"`, `"join-then-ecash"`) mapping to a navigation target and parameter mapping.

Universal links use `?` or `#` delimiters. Community invite codes with a `fedi:` prefix are normalised automatically via [`normalizeCommunityInviteCode`](../common/utils/linking.ts).

---

## Notes

-   Links arriving before onboarding completes are stashed via `setRedirectTo` ([`environment.ts`](../common/redux/environment.ts)) and replayed in [`Splash.tsx`](../native/screens/Splash.tsx).
-   Links arriving before nav mounts are queued in [`Router.tsx`](../native/Router.tsx)'s `pendingLinks` and flushed on `onReady`.
