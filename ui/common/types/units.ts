// This is an implementation of an opaque type
// since they are not natively supported in Typescript
type BitcoinUnit<K, T> = K & { _: T }
type FiatUnit<K, T> = K & { _: T }

export type Btc = BitcoinUnit<number, 'Btc'>
export type Sats = BitcoinUnit<number, 'Sats'>
export type MSats = BitcoinUnit<number, 'MSats'>
export type BtcString = BitcoinUnit<string, 'BtcString'>
export type SatsString = BitcoinUnit<string, 'SatsString'>
export type MsatsString = BitcoinUnit<string, 'MsatsString'>
export type Usd = FiatUnit<number, 'Usd'>
export type UsdCents = FiatUnit<number, 'UsdCents'>
export type UsdString = FiatUnit<string, 'UsdString'>
