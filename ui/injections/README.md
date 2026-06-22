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
