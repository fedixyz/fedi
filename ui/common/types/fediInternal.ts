import { RequestInvoiceArgs } from 'webln'

export type EcashRequest = Omit<RequestInvoiceArgs, 'defaultMemo'>

export type FediInternalVersion = 0

// this matches the CacheMode type in react-native-webview/lib/WebViewTypes.d.ts
export type FediModCacheMode =
    | 'LOAD_DEFAULT'
    | 'LOAD_CACHE_ONLY'
    | 'LOAD_CACHE_ELSE_NETWORK'
    | 'LOAD_NO_CACHE'
