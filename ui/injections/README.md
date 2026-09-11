# WebView Injections

This module is an abstraction around generating APIs that can be injected into
a webview to be made available for web apps. The goal of this repository is to
be agnostic about the webview injection implementation, allowing it to be
reused across multiple types of clients:

-   React Native webviews
-   Electron BrowserView
-   Chrome extension injection scripts

## Using the Library

### `generateInjectionJs`

Generates a string of injectable JavaScript. Takes in an object of which APIs
you want injected.

```ts
import { generateInjectionJs } from '@fedi/injections'

generateInjectionJs({
    webln: true,
    eruda: !!isDebugging,
})
```

#### `webln`

Provides a `window.webln` object that aligns with the WebLN spec.

Read more at https://www.webln.dev/

#### `eruda`

More of a tool than an API, Eruda provides in-browser webtools for clients
that don't have good developer tooling of their own, e.g. react-native.

Read more at https://github.com/liriliri/eruda

#### `fediInternal`

Provides Fedi-specific mini-app APIs. Native clients with `fediInternal.version >= 5` support saving UTF-8 content through the system document picker:

```ts
const result = await window.fediInternal.saveFile({
    filename: 'badge-issuer-authority.json',
    mimeType: 'application/json',
    contents: json,
})
```

The promise resolves to `'saved'` only after the selected destination has been written, or `'cancelled'` when the user closes the picker. Other failures reject the promise. A rejection can occur after writing if the document provider cannot return file metadata. Check the destination before retrying.

Contents must be nonempty and are limited to 10 MiB when UTF-8 encoded. Empty files are rejected before opening the picker because the Android picker reports zero-byte copies as failures. Only one save request may be active at a time. File sharing is a separate behavior and is not provided by this method.

Use the provider injected by Fedi native. A bundled copy's `version` describes that bundle, not the host's capabilities. Without the native WebView bridge, this provider's `saveFile` rejects with `Error('SaveFileUnavailable')` before sending a message. The web host also rejects save requests sent through its separate `{ event, payload }` iframe protocol; this provider does not implement that transport.

The 10 MiB limit bounds temporary-file writes. It does not bound WebView message serialization or parsing. Failure messages from the native host use the device language and are for display, not programmatic matching.

### `sendInjectorMessage`

Sends an injection request from a web page to the host client and resolves when the matching `fedi:message` response event is dispatched. The optional `AbortSignal` cancels the wait and removes the response listener, which is useful for timeouts in tools that call many APIs.

```ts
import { InjectionMessageType } from '@fedi/injections'
import { sendInjectorMessage } from '@fedi/injections/src/utils'

const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), 15_000)

try {
    const info = await sendInjectorMessage(
        {
            id: 1,
            type: InjectionMessageType.webln_getInfo,
            data: undefined,
        },
        controller.signal,
    )
} finally {
    clearTimeout(timer)
}
```

### `makeWebViewMessageHandler`

Make a callback intended to be passed to `react-native-webview`'s `onMessage`
prop. Takes in a `useRef` to a `<WebView />`, an array of async middlewares,
and a dictionary of message handlers keyed by `InjectionMessageType`.

```ts
import {
    makeWebViewMessageHandler,
    InjectionMessageType,
} from '@fedi/injections'

const MyWebView = () => {
    const webviewRef = useRef()

    const handleMessage = makeWebViewMessageHandler(
        webviewRef,
        [],
        {
            [InjectionMessageType.webln_getInfo]: () => {
                return {
                    /* ... */
                }
            },
            // ... methods for the rest of the message types
        },
    )

    return <WebView ref={webviewRef} onMessage={handleMessage} />
}
```

## Project Structure

All source code is contained in the `src` folder. The compilation of the module
happens in two stages:

1. Compile all of the files in `injectables/*.ts` individually with Webpack
2. Compile the module with Webpack using `src/index.ts` as the entry, and rewriting `INJECTABLE_*` env vars using stringified versions of the `injectables/*.ts` files that were just compiled

## Running the project

To run in development mode:

```sh
yarn dev
```

To build a production version:

```sh
yarn build
```
