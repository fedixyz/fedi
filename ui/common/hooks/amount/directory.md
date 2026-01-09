# Amount Hooks Directory

As you may have noticed by now, there is an unholy amount of `amount` hooks (pun intended).

This guide is written in a simple, example-based format with the intention of helping you find the right hook to use.

The order of the hooks listed go from most to least versatile.

-   [`useAmountFormatter`](#useamountformatter)
-   [`useAmountInput`](#useamountinput)

## `useAmountFormatter`

Provides a selection of conversion utilities (Sats, MSats, Cents, and Transactions) that outputs a set of formatted values in both **fiat** and **bitcoin**.

Currency/bitcoin rates, currency locale, symbol positioning, and user preference (sats/fiat) are already handled.

The final result of using this hook looks something like this

```js
{
    formattedFiat: "12.24 USD",
    formattedSats: "1,355 SATS",
    formattedBtc: "0.00001355 BTC",
    formattedUsd: "12.24 USD",
    formattedPrimaryAmount: "12.24 USD",
    formattedSecondaryAmount: "1,355 SATS",
}
```

### Usage

```ts
const { makeFormattedAmountsFromSats } = useAmountFormatter()

const balance: Sats = 1000
const { formattedPrimaryAmount, formattedSecondaryAmount } =
    makeFormattedAmountsFromSats(balance)

console.log(`You have ${formattedPrimaryAmount} (${formattedSecondaryAmount})`)
```

## `useAmountInput`

A hook containing the logic for an amount input, usually used within an `<AmountInput />` component in either the `web` or `native` codebase.

### Usage

You probably won't use this hook directly. See `native/components/ui/AmountInput.tsx` and `web/src/components/AmountInput.tsx` for more information.
