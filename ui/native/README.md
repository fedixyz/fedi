⚠️ Docs are AI-generated. Please review with caution ⚠️

# Development Environment

To set up the development environment you will need to make sure you can build React Native applications.

Follow the guide here for your OS of choice: [https://reactnative.dev/docs/environment-setup](https://reactnative.dev/docs/environment-setup) (be sure you are reading the React Native CLI Quickstart, not the Expo Go Quickstart)

1. Install dependencies

First install your Node modules with

```
yarn install
```

You will also need to [install Rust](https://www.rust-lang.org/tools/install) because all the actual interaction with the Federation happens via [this rust code](https://github.com/fedibtc/fedi-react-native/tree/master/bridge).

2. Start Metro

The Metro server is the JavaScript bundler that ships with React Native.

Make sure you are inside the root of the React Native project folder (this should be the `/ui/native` directory, at the same level as `/android` and `/ios` folders) then run:

```
yarn run start
```

3. Build the bridge

The [Rust bridge](https://github.com/fedibtc/fedi-react-native/tree/master/bridge) gets built automatically by the `npm run android` and `npm run ios` commands, but as a first run try building it independently with `npm run build-bridge-android` and `npm run build-bridge-ios`. You can build these in parallel with separate terminals.

```
# builds ios
yarn run build-bridge-ios

# builds android
yarn run build-bridge-android
```

If you have any trouble, check the [bridge/README](https://github.com/fedibtc/fedi-react-native/blob/master/bridge/README.md) and if your problem isn't covered there, open an issue.

If there are no changes to the bridge since your last build, this process should be pretty quick as it does not rebuild from scratch.

4. Run the app

Making sure your Metro Bundler is running from step 2, open a separate terminal to run the android app:

```
yarn run android
```

Open an additional terminal to run the iOS app:

```
yarn run ios
```

You should see the app running in the iOS Simulator or Android Studio emulator shortly.

If you are running an AArch64 Mac (M1/M2) and see an error when running `npm run ios` instead try:

```
yarn run ios-arm64
```

If you still have trouble, open the `/ui/native/ios/FediReactNative.xcworkspace` in Xcode and try running the app from there. Otherwise, double-check your React Native environment setup before opening an issue.

## Directory Structure

-   `/screens`

    -   contains React components that are directly accessible by the navigator
    -   need to be properly typed and added to the `Router`

-   `/components` folder

    -   contains React components categorized by `/feature`
    -   consider creating a new folder if building something that does not fall into one of the existing `/feature` categories
    -   `/components/ui` is for more generalized components expected to be reused in many (3+) different components or screens

## Style Guide

TODO:...

## Troubleshooting

Read android logs off emulator:

```
adb -s <emulator> shell "run-as com.fedi cat /data/user/0/com.fedi/files/fedi.log" > fedi.log
```

Set `FEDI_EMULATOR=1` to only compile rust code for `aarch64-linux-android`, which is what Justin's emulator uses. Not sure if all emulators use this. Improve later ...

### Run Two Android Emulators

```
yarn run start
yarn run android
yarn run android -- --deviceid=<deviceid>
```

### List iOS Device IDs

```
xcrun xctrace list devices
```

### Cannot Connect to Development Server

On an Android simulator, if the app installs but cannot connect to the Metro packaging server (usually running on port 8081) try running `adb reverse tcp:8081 tcp:8081` to resolve the problem. (see [this guide](https://reactnative.dev/docs/running-on-device?platform=android#method-1-using-adb-reverse-recommended) for details)

## Push Notifications

Push notifications cover **chat**, **payments**, **announcements**, and **Zendesk** support.
They use **FCM**, **Notifee**, and the **Zendesk SDK**.

### Setup

-   **Context & auto-init**

    -   [`NotificationContextProvider`](./native/state/contexts/NotificationContext.tsx)
        Orchestrates setup, requests permissions, and exposes:

        -   `isNotificationEnabled`
        -   `triggerPushNotificationSetup`

    -   **Notes**

        -   Runs on app start; logs current permission; wires matrix + Zendesk hooks.

-   **Permissions**

    -   Requested once the user has ≥1 chat (`requestNotifications`) in
        [`NotificationContextProvider`](./native/state/contexts/NotificationContext.tsx)
    -   Falls back to `Linking.openSettings()` if denied.
    -   **Notes**

        -   Keeps the README example style: simple prompt → if not granted, deep link to Settings.

-   **Token publishing**

    -   Manual trigger → [`manuallyPublishNotificationToken`](./native/utils/notifications.ts)
    -   Matrix (Sygnal) → `configureMatrixPushNotifications` (from [`@fedi/common/redux`](./common/redux/))
    -   Zendesk → `Zendesk.updatePushNotificationToken`
    -   **Notes**

        -   Retrieves FCM token once; publishes to Matrix and Zendesk (when support permission is granted).
        -   Safe to re-trigger (idempotent enough for UX “Try again” flows).

---

### Native Configuration

-   **iOS** — [`AppDelegate.m`](./native/ios/AppDelegate.m)

    -   APNs + Firebase + Zendesk token flow → `application:didRegisterForRemoteNotificationsWithDeviceToken`
    -   Foreground behavior → `userNotificationCenter:willPresentNotification`
    -   Tap handling (bridged to RN) → `userNotificationCenter:didReceiveNotificationResponse`
    -   Universal Links (incl. foreground) → `application:continueUserActivity`
    -   Badge reset (on focus) → [`useDismissIosNotifications`](./native/utils/hooks/notifications.ts)
    -   **Notes**

        -   **Foreground**: system UI is suppressed (`UNNotificationPresentationOptionNone`); we render announcements via Notifee ourselves.
        -   **Background**: iOS shows notifications; taps are bridged to JS (see _PushNotificationEmitter_ below).
        -   Always forwards universal links to JS even when app is foregrounded.

-   **Android**

    -   Types grouped → `GROUP_IDS` in [`notifications.ts`](./native/utils/notifications.ts)
    -   Display & group summaries → `dispatchNotification`
    -   Interaction (deep links, Zendesk routing, badge decrement) → `handleBackgroundNotificationUpdate`
    -   **Notes**

        -   One Android **group/stack per business type** (`chat`, `payment`, `announcement`, `zendesk`).
        -   Summary notification kept in sync alongside child notifications.

---

### Behaviour

-   **Foreground**

    -   Suppress chat FCM (avoid duplicates while user is in-app) → `handleForegroundFCMReceived`
    -   Show campaign/announcements via Notifee → `displayAnnouncement`
    -   **Notes**

        -   Chat “unread” FCMs are ignored when active; announcements require `notification` payload.

-   **Background**

    -   Chat notifications → `displayMessageReceivedNotification` (deep link to room)
    -   Payments (inbound only) → `displayPaymentReceivedNotification`

        -   Skips **outbound**
        -   Skips **on-chain** until _claimed_
        -   Skips **ecash (`oobReceive`)** until _done_

    -   **Notes**

        -   Federation name (when available) is included in payment titles; amounts formatted in sats.

-   **Interaction**

    -   Decrement badge on dismiss/press → `handleBackgroundNotificationUpdate`
    -   Detect Zendesk payload → `isZendeskNotification`
    -   Open Zendesk view → `launchZendeskSupport`
    -   Deep link into app → `Linking.openURL`
    -   **Notes**

        -   Zendesk taps first close any open messenger view, then re-launch cleanly.

-   **Badges**

    -   Increment on display → `dispatchNotification`
    -   Reset on iOS focus → [`useDismissIosNotifications`](./native/utils/hooks/notifications.ts)
    -   **Notes**

        -   Badge count is read-modify-write via Notifee; safe no-op when already 0.

---

### Notification Types

-   Defined in `NOTIFICATION_TYPES` → (`chat`, `payment`, `announcement`, `zendesk`)
-   Android groups in `GROUP_IDS` (one stack per type)
-   Summaries maintained in `dispatchNotification`

---

### Tapping Push Notifications: iOS → JS event bridge (PushNotificationEmitter)

-   **Files**

    -   Objective-C implementation → [`native/ios/PushNotificationEmitter.m`](./native/ios/PushNotificationEmitter.m)
    -   Objective-C header → [`native/ios/PushNotificationEmitter.h`](./native/ios/PushNotificationEmitter.h)

-   **What it does**

    -   Exposes a single RN event: **`PushNotificationTapped`**.
    -   Provides a static bridge method: `+sendPushNotificationEvent:(NSDictionary *)userInfo`.

-   **Flow**

    1. `AppDelegate` receives a tap → `userNotificationCenter:didReceiveNotificationResponse`.
    2. `PushNotificationEmitter.sendPushNotificationEvent(userInfo)` posts an internal `NSNotification` named **`PushNotificationTapped`**.
    3. The `RCTEventEmitter` subclass observes that notification in `startObserving`.
    4. On receipt, it calls `sendEventWithName:@"PushNotificationTapped" body:userInfo` to JS.

-   **Key implementation points**

    -   Singleton allocation via `allocWithZone` (one emitter instance for RN).
    -   `supportedEvents` returns `@[@"PushNotificationTapped"]`.
    -   `startObserving` / `stopObserving` add/remove the `NSNotificationCenter` observer.

-   **Subscribing in JS (example)**

    ```ts
    import { NativeEventEmitter, NativeModules } from 'react-native'

    const { PushNotificationEmitter } = NativeModules
    const emitter = new NativeEventEmitter(PushNotificationEmitter)

    const sub = emitter.addListener('PushNotificationTapped', payload => {
        // Inspect payload, route deep link, handle Zendesk, etc.
    })

    // later
    sub.remove()
    ```

## Deep Linking

This section documents the **native wiring** for deep links (Router integration, in-app linking shim, React Navigation, notification taps, iOS handoff). For parsing, utilities, constants, types, and the PIN-aware queue, see **Common UI → Deep Linking (Common)**.

### URL formats

-   **Universal Links** → handled and often converted to `fedi://` internally.
-   **Native** `fedi://<screen>/<id?>` → routed directly into React Navigation.

### Entry points

-   **Router wiring** → [`Router.tsx`](./native/Router.tsx)

    -   Sets navigation ref: `setNavigationRef`
    -   Marks readiness: `setNavigationReady`
    -   Updates PIN readiness: `setAppUnlocked`
    -   Supplies React Navigation with `linking` config from `getLinkingConfig(parseUrl)`
    -   **Notes**: Logs route changes, redacts sensitive params, shows loader fallback, mounts `OmniLinkHandler` only when the app is unlocked.

-   **Linking shim for in-app universal links** → [`Router.tsx`](./native/Router.tsx)

    -   Overrides `Linking.openURL` at runtime:
        -   Detects universal link → tries `handleInternalDeepLink` first
        -   Falls back to `parseLink` → tries again → else opens browser
    -   **Notes**: Ensures `https://app.fedi.xyz/link` clicked _inside the app_ routes internally instead of bouncing to the browser.

-   **Navigation & flow (native wiring)** → see [`utils/linking.ts`](./native/utils/linking.ts):
    -   `createNavigationAction(parsed)` builds `CommonActions.navigate(...)`
    -   `handleInternalDeepLink(...)` (PIN-aware; queues via Common’s `PinAwareDeepLinkQueue`)
    -   `handleInternalDeepLinkDirect(...)` (parse → build action → dispatch)
    -   `handleFediModNavigation(...)` and `openURL(...)` (external vs. internal routing)

### Routing config

-   **React Navigation map** → `deepLinksConfig` in [`utils/linking.ts`](./native/utils/linking.ts)

    -   Screens mapped: `Home`, `Chat`, `Federations`, `Send`, `Transactions`, `ChatRoomConversation (room/:roomId)`, `ChatUserConversation (user/:userId)`, `ShareLogs (share-logs/:ticketNumber)`

### Utilities (parser, constants, types, queue)

See **Common UI → Deep Linking (Common)** for the shared helpers used by native:

-   [`constants/linking.ts`](../common/constants/linking.ts)
-   [`utils/linking.ts`](../common/utils/linking.ts)
-   [`types/linking.ts`](../common/types/linking.ts)

**Notes**

-   Native focuses on **wiring** (Router integration, in-app linking shim, notification taps, iOS handoff).
-   The **common** layer owns **detection**, **parsing**, **conversion**, **URI helpers**, and the **PIN-aware queue**.

### React Navigation `linking` config

-   **Provider** → `getLinkingConfig(fallback)` in [`utils/linking.ts`](./native/utils/linking.ts)

    -   `prefixes`: `fedi://`, `fedi:`, `lightning:`, `lnurl:`, `bitcoin:`, `lnurlw://`, `lnurlp://`, `keyauth://`
    -   `config`: `deepLinksConfig`
    -   **getInitialURL**:

        -   Reads `Linking.getInitialURL()` and Notifee’s `getInitialNotification()`
        -   For universal/fedi links → queues to **PinAwareDeepLinkQueue** (returns `null` so RN won’t consume)
        -   Else → `parseLink(url, fallback)`

    -   **subscribe(listener)**:

        -   `Linking.addEventListener('url', ...)` with Zendesk close + PIN-aware fast path
        -   Notifee `onForegroundEvent(EventType.PRESS)` press handling with the same flow

    -   **Notes**: Keeps React Navigation as a fallback; prefers internal routing when the app is fully ready.

### Notification integration

-   **Foreground notification taps** → handled in `subscribe` via Notifee’s `onForegroundEvent` in [`utils/linking.ts`](./native/utils/linking.ts)

    -   Detects Zendesk payload → `launchZendeskSupport`
    -   Otherwise, processes `data.link` with the same universal/fedi logic
    -   **Notes**: Mirrors URL event handling for a consistent path.

### iOS native handoff (context)

-   **Universal links while foreground** → `application:continueUserActivity` in [`ios/AppDelegate.m`](./native/ios/AppDelegate.m)

    -   Always forwards to `RCTLinkingManager` so RN handlers receive the URL.
    -   **Notes**: Complements the RN subscribe path; ensures iOS delivers links even when the app is open.

## Zendesk Native Support Integration

This documents the **native wiring** for Zendesk (env, UI flows, hooks, push taps). For **Redux state/actions/selectors** and **JWT details**, see **Common UI → Zendesk (Common)**.

### Environment & Setup

#### Environment Configuration

-   Copy `.env.sample` → `.env`
-   Uses `@env` (dotenv) to inject keys into the app at build time

#### Required Declarations

```typescript
declare module '@env' {
    export const CHANNEL_KEY_ANDROID: string
    export const CHANNEL_KEY_IOS: string
    export const ZENDESK_SECRET_KEY: string
    export const ZENDESK_KID: string
}
```

> **Note:** Without a populated `.env`, Zendesk will not initialize in local development.

### CI / GitHub Secrets

Secrets are stored in **GitHub Actions → Repository secrets** and injected into `ui/native/.env` during CI.

##### TestFlight Workflow

Injects production secrets:

```yaml
CHANNEL_KEY_ANDROID: ${{ secrets.ZENDESK_CHANNEL_KEY_ANDROID }}
CHANNEL_KEY_IOS: ${{ secrets.ZENDESK_CHANNEL_KEY_IOS }}
ZENDESK_KID: ${{ secrets.ZENDESK_KEY_ID }}
ZENDESK_SECRET_KEY: ${{ secrets.ZENDESK_SECRET }}
```

##### Nightly Workflow

Injects development variants:

```yaml
CHANNEL_KEY_ANDROID: ${{ secrets.ZENDESK_CHANNEL_KEY_ANDROID_DEV }}
CHANNEL_KEY_IOS: ${{ secrets.ZENDESK_CHANNEL_KEY_IOS_DEV }}
ZENDESK_KID: ${{ secrets.ZENDESK_KEY_ID_DEV }}
ZENDESK_SECRET_KEY: ${{ secrets.ZENDESK_SECRET_DEV }}
```

> **Note:** CI creates `ui/native/.env` dynamically; no plaintext secrets are committed. The app reads them via `@env` at build time.

### UI Entry Point

-   **Permission + launch screen** → [`native/components/feature/support/SupportChat.tsx`](./native/components/feature/support/SupportChat.tsx)
-   **Permission Flow:** `grantSupportPermission()`
-   **Launch Chat:** `useLaunchZendesk().launchZendesk(true)`
-   **Links:** `PRIVACY_POLICY_URL`, `HELP_URL`

> **Notes:** On permission acceptance, the screen closes while the Zendesk modal opens.

### Homescreen Integration

#### Mods Screen

-   **Mods screen** → [`native/screens/Mods.tsx`](./native/screens/Mods.tsx)
-   "Ask Fedi" shortcut is sorted first
-   If title includes "ask fedi" → `launchZendesk()`; else routes via deep links (`openURL`, `handleFediModNavigation`)

#### Badge Component

-   **Badge** → [`native/components/feature/support/ZendeskBadge.tsx`](./native/components/feature/support/ZendeskBadge.tsx)
-   Reads unread count from Redux (see Common selectors)
-   Shown only if `title.toLowerCase() === 'ask fedi'` and count > 0
-   Small red badge with white text, absolute positioned on the tile

### Hooks

#### Launch Zendesk

-   **Launch Zendesk** → [`native/utils/hooks/support.ts`](./native/utils/hooks/support.ts) → `useLaunchZendesk()`
-   No permission → navigates to `HelpCentre`
-   Not initialized → `zendeskInitialize(...)`
-   Opens modal → `zendeskOpenMessagingView({ onError })`

#### Unread Count Polling

-   **Unread count polling** → [`native/utils/hooks/support.ts`](./native/utils/hooks/support.ts) → periodic update
-   Runs every 8s (skips until permission is granted)
-   Updates the Redux unread count (see Common for state/selectors)

### Native Helpers

-   **Initialize / login** → [`native/utils/support.ts`](./native/utils/support.ts) → `zendeskInitialize(...)`

    -   `Zendesk.initialize({ channelKey })` using `CHANNEL_KEY_ANDROID` / `CHANNEL_KEY_IOS`
    -   If user present → JWT via `generateZendeskTokenFromPubkey(...)` → `Zendesk.login(token)`
    -   Sets `zendeskInitialized` in Redux (see Common for state)

-   **Open / close / reset** → [`native/utils/support.ts`](./native/utils/support.ts)

    -   `zendeskOpenMessagingView`, `zendeskCloseMessagingView`, `zendeskReset`

-   **Launch without hooks** → [`native/utils/support.ts`](./native/utils/support.ts) → `launchZendeskSupport(...)`
-   **Push token**

    -   Forward to native SDK → `Zendesk.updatePushNotificationToken(token)`
    -   Mirror in Redux (see Common for state/selectors)

### Notifications

-   **Push taps:** detect Zendesk payload → `launchZendeskSupport(...)`

> **Notes:** For APNs token registration and general push wiring, see **Push Notifications → Native Configuration (iOS)**.

## Android Keyboard (SDK 35)

Keyboard handling covers **chat**, **forms**, and **fixed footers**. It uses **custom hooks** and a shared **KeyboardManager**; The introduction of SDK 35 edge to edge means seperate padding / keyboard behaviours on 'old' (< sdk 35) and new (> SDK 35) devices.

### Setup

#### Chat (list + input)

-   [`useChatKeyboardBehavior`](./native/utils/hooks/keyboard.ts) Orchestrates scroll lift and input sizing; exposes:

    -   `bottomOffset`
    -   `setMessageInputHeight(height)`
    -   `keyboardPadding`

> **Notes:** Android lift is responsive and clamped by `CHAT_KEYBOARD_BEHAVIOR`.

#### Fixed footers (SDK 35+)

-   [`useImeFooterLift`](./native/utils/hooks/keyboard.ts) Returns a value to **add to footer** `marginBottom` when:

    -   Android API ≥ 35
    -   Keyboard visible
    -   A `TextInput` is focused

> **Notes:** Options: `insetsBottom`, `buffer`, `threshold`, `subtractSafeAreaBottom`, `gate`. No-ops on older Android versions.

#### iOS offsets

-   Continue to use `KeyboardAvoidingView` / wrappers.
-   Optional boolean → [`useIosKeyboardOpen`](./native/utils/hooks/keyboard.ts)

> **Notes:** Useful for absolute-positioned footers (e.g., Create Group).

#### Force blur on hide (Android)

-   [`useForceBlurOnKeyboardHide`](./native/utils/hooks/keyboard.ts)

> **Notes:** Clears stale `TextInput` focus after IME dismiss.

### Native Configuration

#### iOS

-   No SDK 35 changes required.
-   Combine `KeyboardAvoidingView` + [`useIosKeyboardOpen`](./native/utils/hooks/keyboard.ts) if using absolute-positioned footers.

> **Notes:** Keep content scrollable; apply extra bottom padding only when needed.

#### Android

-   Edge-to-edge gate → [`isAndroidAPI35Plus`](./utils/layout.ts)
-   Shared keyboard manager → [`native/utils/hooks/keyboard.ts`](./native/utils/hooks/keyboard.ts)

> **Notes:** Fix: previous `isAndroidAPI30Plus` added incorrect padding. Now gated at API 35. Durable animation durations reduce UI jank.

### Behaviour

#### Visible

-   Chat lists → lifted by `bottomOffset`.
-   Footers → lifted via [`useImeFooterLift(...)`](./native/utils/hooks/keyboard.ts).

> **Notes:** Safe-area bottom is respected; small screens add `keyboardPadding`.

#### Hidden

-   Offsets reset to `0`.
-   Optional Android: [`useForceBlurOnKeyboardHide(true)`](./native/utils/hooks/keyboard.ts) to clear focus.

> **Notes:** Prevents "phantom" focused inputs after dismiss.

#### Forms / absolute footers

-   iOS → optionally add padding when [`useIosKeyboardOpen()`](./native/utils/hooks/keyboard.ts) is `true`.
-   Android (API 35+) → add `marginBottom={useImeFooterLift(...)}`.

> **Notes:** Ensures primary buttons remain tappable when IME is shown.

### Hooks

Defined in [`native/utils/hooks/keyboard.ts`](./native/utils/hooks/keyboard.ts)

-   [`useKeyboard()`](./native/utils/hooks/keyboard.ts) → low-level state:

    -   `isVisible`, `height`, `screenHeight`, `animationDuration`, `insets`

-   [`useChatKeyboardBehavior()`](./native/utils/hooks/keyboard.ts) → chat-specific:

    -   `bottomOffset`, `setMessageInputHeight`, `keyboardPadding`

-   [`useImeFooterLift(options)`](./native/utils/hooks/keyboard.ts) → SDK 35 footer lift
-   [`useIosKeyboardOpen(threshold?)`](./native/utils/hooks/keyboard.ts) → iOS boolean
-   [`useForceBlurOnKeyboardHide(enabled?)`](./native/utils/hooks/keyboard.ts) → Android workaround

> **Notes:** Constants in [`native/utils/constants`](./native/utils/constants):
>
> -   `CHAT_KEYBOARD_BEHAVIOR` (`ANDROID_OFFSET_PERCENT`, `MAX_BOTTOM_PERCENT`)
> -   `KEYBOARD_PADDING` (`SMALL_MULTIPLIER`, `SMALL_MAX_PERCENT`, `LARGE_MULTIPLIER`, `LARGE_MAX_PERCENT`)

### Keyboard → JS state bridge (KeyboardManager)

#### Files

-   Hooks & manager → [`native/utils/hooks/keyboard.ts`](./native/utils/hooks/keyboard.ts)
-   Platform gate → [`native/utils/layout.ts`](./native/utils/layout.ts)

#### What it does

-   Shares a single keyboard subscription; normalizes duration and height.
-   Computes responsive lifts and safe caps across devices.

#### Flow

1. Keyboard events update the shared `KeyboardManager` state.
2. Hooks subscribe and compute per-screen offsets/padding.
3. Screens apply `bottomOffset` (lists) or `marginBottom` (footers).

#### Key implementation points

-   API gate: `isAndroidAPI35Plus()` controls edge-to-edge math.
-   Safe cleanup: listeners attach once; teardown when last subscriber unmounts.
-   Android-only footer lift; iOS uses standard avoiding behavior.

### Safe Area Components

#### SafeAreaContainer

-   **Component** → [`components/ui/SafeArea.tsx`](./components/ui/SafeArea.tsx) → `SafeAreaContainer`
-   Wrapper around `SafeAreaView` with consistent API for safe area padding and edge handling
-   **Edge presets:** `horizontal`, `vertical`, `bottom`, `top`, `all`, `notop`, `none`
-   Optional `padding` prop (theme spacing key)

#### SafeScrollArea

-   **Component** → [`components/ui/SafeArea.tsx`](./components/ui/SafeArea.tsx) → `SafeScrollArea`
-   Creates scrollable area with safe area padding
-   Inherits `SafeAreaContainer` props plus `ScrollView` props
-   Additional `safeAreaContainerStyle` prop for container styling

### Usage Examples

#### Chat (list + input)

```javascript
const { bottomOffset, setMessageInputHeight } = useChatKeyboardBehavior()
<ChatConversation newMessageBottomOffset={bottomOffset} />
<MessageInput onHeightChanged={setMessageInputHeight} />
```

#### Footer (Android SDK 35+)

```javascript
const insets = useSafeAreaInsets()
const extraPadAndroid35 = useImeFooterLift({ insetsBottom: insets.bottom, buffer: 20 })
<View style={{ paddingBottom: insets.bottom + 16, marginBottom: extraPadAndroid35 }}>
  <Button title="Save" />
</View>
```

#### iOS absolute footer helper

```javascript
const openIOS = useIosKeyboardOpen(80)
<View style={{ paddingBottom: insets.bottom + 16 + (openIOS ? 40 : 0) }} />
```

#### SafeAreaContainer usage

```javascript
// Basic usage with edge preset
<SafeAreaContainer edges="vertical">
  {children}
</SafeAreaContainer>

// Custom edges with theme padding
<SafeAreaContainer
  edges={{ top: 'maximum', bottom: 'off', left: 'additive', right: 'additive' }}
  padding="xl">
  {children}
</SafeAreaContainer>
```

#### SafeScrollArea with keyboard handling

```javascript
// AddFediMod screen example
const insets = useSafeAreaInsets()
const extraPadAndroid35 = useImeFooterLift({
  insetsBottom: insets.bottom,
  buffer: theme.spacing.xxl,
})

<SafeScrollArea
  ref={scrollRef}
  keyboardShouldPersistTaps="handled"
  keyboardDismissMode="on-drag"
  contentContainerStyle={{
    flexGrow: 1,
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.xl,
  }}
  edges="top"
  safeAreaContainerStyle={{ paddingTop: 0 }}>
  {/* Form content */}
</SafeScrollArea>

{/* Footer with keyboard lift */}
<View style={[
  style.buttonContainer,
  {
    paddingBottom: insets.bottom + theme.spacing.lg,
    marginBottom: extraPadAndroid35,
  },
]}>
  <Button onPress={handleSubmit}>Save</Button>
</View>
```

#### FediModBrowser screen example

```javascript
// Basic safe area with vertical edges only
<SafeAreaContainer edges="vertical">
    <WebView {...webViewProps} />
    <FediModBrowserHeader {...headerProps} />
    {/* Overlays */}
</SafeAreaContainer>
```

## Common UI

Contains code shared between the PWA and React Native apps.

### Deep Linking (Common)

Utilities to detect, normalise, parse, and queue deep links across platforms.
Works with both **Universal Links** (`https://app.fedi.xyz/link?...`) and **fedi://** links.

#### Constants

-   Hosts & paths → [`constants/linking.ts`](./common/constants/linking.ts)

    -   `DEEPLINK_HOSTS`, `LINK_PATH`, `TELEGRAM_BASE_URL`, `WHATSAPP_BASE_URL`

#### Detection & conversion

-   **isUniversalLink(raw)** → [`utils/linking.ts`](./common/utils/linking.ts)

    -   True when host matches our UL hosts and the path equals `LINK_PATH`, with `screen=` in query or hash.
    -   **Notes:** Accepts both `?screen=...` and `#screen=...` forms.

-   **universalToFedi(raw)** → [`utils/linking.ts`](./common/utils/linking.ts)

    -   Converts UL to `fedi://<screen>/<id?>` (decodes `id`). Returns `''` on invalid input.

-   **decodeFediDeepLink(uri)** → [`utils/linking.ts`](./common/utils/linking.ts)

    -   Normalises percent-encoding of `fedi://` paths (decodes each path segment).

#### Parser

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

#### URI helpers

-   `isFediUri(uri)`, `stripFediPrefix(uri)`, `prefixFediUri(path)`
-   `parseFediPath(uri)` → `{ screen, id? }`
-   `joinFediPath(screen, id?)` → `'fedi://<screen>/<id?>'`
-   `parseFediUri(uri)` → `Result<{ screen, id? }, Error>`

    -   **Notes:** Safer parsing with `neverthrow` for callers that want explicit error paths.

#### Bridging handler

-   **setDeepLinkHandler(handler)** → [`utils/linking.ts`](./common/utils/linking.ts)

    -   Native registers a callback that common will use to deliver pending links.
    -   **Notes:** Keeps the common layer platform-agnostic while allowing native to drive navigation.

#### PIN-aware queue

-   **PinAwareDeepLinkQueue** → [`utils/linking.ts`](./common/utils/linking.ts)

    -   `add(url)` queues; `flush()` returns and clears; `size()` / `clear()`
    -   `setNavigationReady()` and `setAppUnlocked(unlocked)` mark readiness
    -   Internally calls `processPendingDeepLinks(...)` once **both** navigation and PIN are ready.
    -   **Notes:** Uses a small timeout to accommodate slow device initialisation before dispatching; delivered to the registered `setDeepLinkHandler` callback.

#### Types

-   **Linking types** → [`types/linking.ts`](./common/types/linking.ts)

    -   `ScreenConfig`, `ParsedDeepLink`, `NavigationParams`, `NavigationAction`
    -   **Notes:** Shared between layers; keep in sync with the native navigation map.

### Zendesk (Common)

This section is the **single source of truth** for Zendesk **Redux state**, **actions/selectors**, and **JWT details** used by all apps. For native wiring (env, UI flows, hooks, push taps), see the **Native README**.

#### Redux Slice

-   **File** → [`common/redux/support.ts`](./common/redux/support.ts)

##### State (relevant to Zendesk)

```typescript
{
    supportPermissionGranted: boolean
    zendeskInitialized: boolean
    zendeskPushNotificationToken: string
    zendeskUnreadMessageCount: number
}
```

##### Actions

-   `setSupportPermission`, `setZendeskInitialized`
-   `setZendeskPushNotificationToken`, `setZendeskUnreadMessageCount`
-   `resetSurveyTimestamp`, `setCanShowSurvey`, `setSurveyUrl`

##### Selectors

-   `selectSupportPermissionGranted`, `selectZendeskInitialized`
-   `selectZendeskPushNotificationToken`, `selectZendeskUnreadMessageCount`

##### Persistence

-   `loadFromStorage` hydrates state on startup

##### Convenience Dispatchers

-   `grantSupportPermission()`
-   `saveZendeskPushNotificationToken(token)`
-   `updateZendeskUnreadMessageCount(count)`

> **Notes:** Common owns **state shape** and **APIs**; platform layers should call these rather than writing state directly.

#### Token & Authentication

##### JWT Generation

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

##### Display Name

Fallback to **"Fedi User"** when Matrix display name is missing/placeholder.

#### Permissions

-   Grant via `grantSupportPermission()`; persisted in Redux.
-   Without permission, **native** should route to Help Center instead of opening chat.

#### Unread Count Management

-   Updated by a **native polling hook** (platform decides schedule).
-   Consumed by UI (e.g., the "Ask Fedi" badge).
-   Selector: `selectZendeskUnreadMessageCount`.

#### Push Notifications

-   Token stored in Redux via `setZendeskPushNotificationToken(token)`.
-   Selector: `selectZendeskPushNotificationToken`.
-   **Native** is responsible for forwarding FCM/APNs to Zendesk; Redux mirrors token/state for UI.

#### Development Notes

-   Configure all required environment variables in platform apps.
-   CI/CD should inject secrets; **no plaintext secrets** in the repo.
-   Permission flow must complete before launching Zendesk chat.
-   Once permission is granted, unread count updates are driven by the **native** layer.
