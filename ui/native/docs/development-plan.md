# Overview

This document outlines the development scope of an MVP for the Fedimint mobile app built with React Native.

# Features

- [Federation Connections](#federation-connections)
- [Wallet](#wallet)
- [Sites](#sites)
- [Settings](#settings)
- [Community](#community)
- [Backups / Recovery](#backups--recovery)

------------

## Federation Connections

- Handle camera permissions
- Connect to a federation
  - Scan a QR code
  - Paste a connection string
- Display list of connected federations + balances
- View federation profile
- Display federation connection QR + code
- Share federation connection data
- Switch between connected federations
- Leave a federation

## Wallet

### Balances

- Display balances (BTC, USD, combined)
- Select a wallet to send & receive with

### Transaction History

- Display transaction history
- Select a transaction to display details

### Send & Receive

- Generate Lightning invoices
  - Specify an amount in sats
  - Specify an optional memo
  - Display QR code + invoice short-string
  - Share invoice or copy to clipboard
  - Listen for payment settlement & display success page
- Generate on-chain BTC addresses
  - Display QR code + address short-string
  - Share address or copy to clipboard
  - Listen for transaction detection & display success page
- Scan a QR Code / Paste from clipboard - Lightning invoice
  - of a invoice or address
- Scan a QR Code / Paste from clipboard - BTC address
- ... (Send/Receive USD ???)

## Sites

- Display available WebLN-compatible sites (per federation?)
- Implement WebLN-capable in-app browser
- Build/integrate confirmation UI for LN-Pay
- Build/integrate confirmation UI for LN-Withdraw

## Settings

- Display available settings
- Select bitcoin unit (BTC or sats)
- Select display currency (USD or CBP)
  - Search currencies
  - Implement price-checker for each currency
- Select display language (English or Spanish)
- Display & update username

## Community

- Create a username (same as Settings username???)
- Display a list of chat groups
- ...

## Backups / Recovery

- ...

# MVP Timeline (in progress)

_*** Based on very early estimates that still need refinement_

- Week 1
  - Create dev environment + splash page
  - Create issues for dev tasks / road-mapping
  - Establish code foundations
    - UI libraries (NativeBase, RN vector icons)
    - Navigation (react-navigation vs react-native-navigation)
    - API handlers & State Management
      - react-query for light caching & simplified state management
      - integrate with rust APIs that handle data fetching
      - standard React State (local) or React Context (global) can cover remaining gaps in state management
    - Localized strings with a i18n library like react-i18next
  - Build feature: Federation Connections
- Week 2
  - Build feature: Federation Connections
- Week 3
  - Build feature: Wallet > Balances
  - Build feature: Wallet > Transaction History
  - Build feature: Wallet > Send & Receive
- Week 4
  - Build feature: Wallet > Send & Receive
- Week 5
  - Build feature: Wallet > Send & Receive
  - Build feature: Settings
- Week 6
  - Build feature: Settings
  - Build feature: Sites
- Week 7
  - Build feature: Sites
  - Build remaining features
- Week 8
  - Build remaining features
- Week 9
  - Build remaining features
- Week 10
  - Build remaining features
  - Polish existing features
  - Distributable builds to TestFlight & Play Store with fastlane
- Week 11
  - Build remaining features
  - Polish existing features
- Week 12
  - Build remaining features
  - Polish existing features

