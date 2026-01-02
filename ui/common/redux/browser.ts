import {
    createAsyncThunk,
    createSelector,
    createSlice,
    PayloadAction,
} from '@reduxjs/toolkit'
import omit from 'lodash/omit'
import { RequestInvoiceArgs } from 'webln'

import {
    ParsedLnurlAuth,
    ParsedLnurlPay,
    ParsedLnurlWithdraw,
    Invoice,
    EcashRequest,
    MiniAppPermissionType,
    FediMod,
    SiteInfo,
    MiniAppSessionMap,
    MiniAppSession,
} from '@fedi/common/types'
import { UnsignedNostrEvent } from '@fedi/injections/src/injectables/nostr/types'

import { CommonState } from '.'
import { tryFetchUrlMetadata } from '../utils/fedimods'

const MAX_TAB_HISTORY_LENGTH = 10

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
    requestedPermission: null as MiniAppPermissionType | null,
    currentUrl: null as string | null,
    currentMiniAppId: null as FediMod['id'] | null,
    miniAppSessions: {} as MiniAppSessionMap,
}

export type BrowserState = typeof initialState

export const browserSlice = createSlice({
    name: 'browser',
    initialState,
    reducers: {
        setCurrentUrl(state, action: PayloadAction<{ url: string }>) {
            const { url } = action.payload

            state.currentUrl = url
        },
        // checks if the url we are about to open has any history
        // and resumes browsing from the last visited page
        // otherwise creates a new history entry and sets currentUrl
        // to begin browsing from this URL
        openMiniAppSession(
            state,
            action: PayloadAction<{
                miniAppId: FediMod['id']
                url: FediMod['url']
            }>,
        ) {
            const { miniAppId, url } = action.payload

            const session: MiniAppSession = state.miniAppSessions[
                miniAppId
            ] || {
                miniAppId: miniAppId,
                history: [url],
                historyIndex: 0,
            }

            state.currentUrl = session.history[session.historyIndex]
            state.currentMiniAppId = miniAppId
            state.miniAppSessions = {
                ...state.miniAppSessions,
                [miniAppId]: session,
            }
        },
        goBackInHistory(state) {
            if (state.currentMiniAppId) {
                const currentSession =
                    state.miniAppSessions[state.currentMiniAppId]

                if (currentSession && currentSession.historyIndex > 0) {
                    const newIndex = currentSession.historyIndex - 1
                    state.miniAppSessions = {
                        ...state.miniAppSessions,
                        [currentSession.miniAppId]: {
                            ...currentSession,
                            historyIndex: newIndex,
                        },
                    }
                    state.currentUrl = currentSession.history[newIndex]
                }
            }
        },
        goForwardInHistory(state) {
            if (state.currentMiniAppId) {
                const currentSession =
                    state.miniAppSessions[state.currentMiniAppId]

                if (
                    currentSession &&
                    currentSession.historyIndex <
                        currentSession.history.length - 1
                ) {
                    const newIndex = currentSession.historyIndex + 1
                    state.miniAppSessions = {
                        ...state.miniAppSessions,
                        [currentSession.miniAppId]: {
                            ...currentSession,
                            historyIndex: newIndex,
                        },
                    }
                    state.currentUrl = currentSession.history[newIndex]
                }
            }
        },
        commitUrlToHistory(state) {
            if (!state.currentMiniAppId || !state.currentUrl) return

            const currentSession = state.miniAppSessions[state.currentMiniAppId]
            if (!currentSession) return

            const historyIndex = Math.min(
                currentSession.historyIndex,
                currentSession.history.length - 1,
            )
            const currentPage = currentSession.history[historyIndex]

            // Already in history, don't add duplicate
            if (currentPage === state.currentUrl) {
                return
            }

            const newHistory = [
                ...currentSession.history.slice(0, historyIndex + 1),
                state.currentUrl,
            ].slice(-MAX_TAB_HISTORY_LENGTH)
            const newHistoryIndex = newHistory.length - 1

            state.miniAppSessions = {
                ...state.miniAppSessions,
                [currentSession.miniAppId]: {
                    ...currentSession,
                    history: newHistory,
                    historyIndex: newHistoryIndex,
                },
            }
        },
        goToPage(state, action: PayloadAction<{ targetUrl: string }>) {
            const { targetUrl } = action.payload

            if (state.currentMiniAppId) {
                const currentSession =
                    state.miniAppSessions[state.currentMiniAppId]

                if (currentSession) {
                    const historyIndex = Math.min(
                        currentSession.historyIndex,
                        currentSession.history.length - 1,
                    )
                    const currentPage = currentSession.history[historyIndex]

                    if (currentPage !== targetUrl) {
                        const newHistory = [
                            ...currentSession.history.slice(
                                0,
                                historyIndex + 1,
                            ),
                            targetUrl,
                        ].slice(-MAX_TAB_HISTORY_LENGTH)
                        const newHistoryIndex = newHistory.length - 1

                        state.miniAppSessions = {
                            ...state.miniAppSessions,
                            [currentSession.miniAppId]: {
                                ...currentSession,
                                history: newHistory,
                                historyIndex: newHistoryIndex,
                            },
                        }
                        state.currentUrl = targetUrl
                    }
                }
            }
        },
        replaceCurrentPage(
            state,
            action: PayloadAction<{ targetUrl: string }>,
        ) {
            const { targetUrl } = action.payload

            if (state.currentMiniAppId) {
                const currentSession =
                    state.miniAppSessions[state.currentMiniAppId]

                if (currentSession) {
                    const history = [...currentSession.history]
                    history[currentSession.historyIndex] = targetUrl

                    state.miniAppSessions = {
                        ...state.miniAppSessions,
                        [currentSession.miniAppId]: {
                            ...currentSession,
                            history,
                        },
                    }
                    state.currentUrl = targetUrl
                }
            }
        },
        clearMiniAppHistory(state) {
            if (state.currentMiniAppId) {
                const currentSession =
                    state.miniAppSessions[state.currentMiniAppId]

                if (currentSession) {
                    state.miniAppSessions = omit(
                        state.miniAppSessions,
                        currentSession.miniAppId,
                    )
                }
            }
        },
        clearAllMiniAppSessions(state) {
            state.miniAppSessions = {}
        },
        closeBrowser(state) {
            state.currentUrl = null
            state.currentMiniAppId = null
        },
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
        setRequestedPermission(state, action) {
            state.requestedPermission = action.payload
        },
        resetBrowserOverlayState(state) {
            state.requestInvoiceArgs = null
            state.invoiceToPay = null
            state.lnurlWithdrawal = null
            state.lnurlPayment = null
            state.lnurlAuthRequest = null
            state.nostrUnsignedEvent = null
            state.ecashRequest = null
            state.requestedPermission = null
        },
    },
})

export const {
    setCurrentUrl,
    openMiniAppSession,
    goBackInHistory,
    goForwardInHistory,
    commitUrlToHistory,
    goToPage,
    replaceCurrentPage,
    clearMiniAppHistory,
    clearAllMiniAppSessions,
    closeBrowser,
    setSiteInfo,
    setRequestInvoiceArgs,
    setInvoiceToPay,
    setLnurlWithdrawal,
    setLnurlPayment,
    setLnurlAuthRequest,
    setNostrUnsignedEvent,
    setEcashRequest,
    setRequestedPermission,
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
    tryFetchUrlMetadata(resolvedUrl).map(({ icon, title }) => {
        dispatch(setSiteInfo({ icon, title, url: resolvedUrl.toString() }))
    })
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
export const selectRequestedPermission = (s: CommonState) =>
    s.browser.requestedPermission
export const selectCurrentUrl = (s: CommonState): string | null =>
    s.browser.currentUrl

// for displaying the URL in the address bar
export const selectCurrentUrlFormatted = createSelector(
    selectCurrentUrl,
    (currentUrl: string | null): string => {
        if (!currentUrl) return ''
        try {
            const url = new URL(currentUrl)
            return (
                url.href
                    // Remove the protocol (https:// or http://) from the front
                    .replace(/^https?:\/\//, '')
                    // trim trailing slashes
                    .replace(/\/+$/, '')
            )
        } catch {
            return currentUrl
        }
    },
)
export const selectCurrentMiniAppId = (s: CommonState): FediMod['id'] | null =>
    s.browser.currentMiniAppId
export const selectMiniAppSessions = (s: CommonState) =>
    s.browser.miniAppSessions

export const selectCurrentMiniAppSession = createSelector(
    selectCurrentMiniAppId,
    selectMiniAppSessions,
    (
        currentMiniAppId: FediMod['id'] | null,
        sessions: MiniAppSessionMap,
    ): MiniAppSession | undefined => {
        if (!currentMiniAppId) {
            return undefined
        }
        return sessions[currentMiniAppId]
    },
)

export const selectCanGoBack = createSelector(
    selectCurrentMiniAppSession,
    (currentSession: MiniAppSession | undefined): boolean => {
        if (!currentSession) {
            return false
        }
        return currentSession.historyIndex > 0
    },
)

export const selectCanGoForward = createSelector(
    selectCurrentMiniAppSession,
    (currentSession: MiniAppSession | undefined): boolean => {
        if (!currentSession) {
            return false
        }
        return currentSession.historyIndex < currentSession.history.length - 1
    },
)
