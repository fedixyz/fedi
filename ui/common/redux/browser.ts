import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { RequestInvoiceArgs } from 'webln'

import {
    ParsedLnurlAuth,
    ParsedLnurlPay,
    ParsedLnurlWithdraw,
    Invoice,
    EcashRequest,
} from '@fedi/common/types'
import { UnsignedNostrEvent } from '@fedi/injections/src/injectables/nostr/types'

import { CommonState } from '.'
import { fetchMetadataFromUrl } from '../utils/fedimods'

type SiteInfo = {
    icon: string
    title: string
    url: string
}

const initialState = {
    siteInfo: null as SiteInfo | null,
    requestInvoiceArgs: null as RequestInvoiceArgs | null,
    invoiceToPay: null as Invoice | null,
    lnurlWithdrawal: null as ParsedLnurlWithdraw['data'] | null,
    lnurlPayment: null as ParsedLnurlPay['data'] | null,
    lnurlAuthRequest: null as ParsedLnurlAuth['data'] | null,
    nostrUnsignedEvent: null as UnsignedNostrEvent | null,
    ecashRequest: null as EcashRequest | null,
    addressOverlayOpen: false,
}

export type BrowserState = typeof initialState

export const browserSlice = createSlice({
    name: 'browser',
    initialState,
    reducers: {
        setSiteInfo(state, action) {
            state.siteInfo = action.payload
        },
        setAddressOverlayOpen(state, action) {
            state.addressOverlayOpen = action.payload
        },
        setRequestInvoiceArgs(state, action) {
            state.requestInvoiceArgs = action.payload
        },
        setInvoiceToPay(state, action) {
            state.invoiceToPay = action.payload
        },
        setLnurlWithdrawal(state, action) {
            state.lnurlWithdrawal = action.payload
        },
        setLnurlPayment(state, action) {
            state.lnurlPayment = action.payload
        },
        setLnurlAuthRequest(state, action) {
            state.lnurlAuthRequest = action.payload
        },
        setNostrUnsignedEvent(state, action) {
            state.nostrUnsignedEvent = action.payload
        },
        setEcashRequest(state, action) {
            state.ecashRequest = action.payload
        },
        resetBrowserOverlayState(state) {
            state.requestInvoiceArgs = null
            state.invoiceToPay = null
            state.lnurlWithdrawal = null
            state.lnurlPayment = null
            state.lnurlAuthRequest = null
            state.nostrUnsignedEvent = null
            state.ecashRequest = null
        },
    },
})

export const {
    setSiteInfo,
    setRequestInvoiceArgs,
    setInvoiceToPay,
    setLnurlWithdrawal,
    setLnurlPayment,
    setLnurlAuthRequest,
    setNostrUnsignedEvent,
    setEcashRequest,
    resetBrowserOverlayState,
    setAddressOverlayOpen,
} = browserSlice.actions

/*** Async thunks ***/

export const refetchSiteInfo = createAsyncThunk<
    void,
    { url: string },
    { state: CommonState }
>('browser/navigateToUrl', async ({ url }, { dispatch }) => {
    const resolvedUrl = new URL(url)
    const { fetchedIcon, fetchedTitle } = await fetchMetadataFromUrl(url)

    // Prefer the shorter of title or hostname
    const resolvedTitle =
        resolvedUrl.hostname.length > fetchedTitle.length
            ? fetchedTitle
            : resolvedUrl.hostname

    dispatch(setSiteInfo({ icon: fetchedIcon, title: resolvedTitle, url }))
})

/*** Selectors ***/

export const selectSiteInfo = (s: CommonState) => s.browser.siteInfo
export const selectRequestInvoiceArgs = (s: CommonState) =>
    s.browser.requestInvoiceArgs
export const selectInvoiceToPay = (s: CommonState) => s.browser.invoiceToPay
export const selectLnurlWithdrawal = (s: CommonState) =>
    s.browser.lnurlWithdrawal
export const selectLnurlPayment = (s: CommonState) => s.browser.lnurlPayment
export const selectLnurlAuthRequest = (s: CommonState) =>
    s.browser.lnurlAuthRequest
export const selectNostrUnsignedEvent = (s: CommonState) =>
    s.browser.nostrUnsignedEvent
export const selectEcashRequest = (s: CommonState) => s.browser.ecashRequest
export const selectAddressOverlayOpen = (s: CommonState) =>
    s.browser.addressOverlayOpen
