import { useNavigation } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { MutableRefObject, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ActivityIndicator,
    BackHandler,
    Linking,
    StyleSheet,
    View,
} from 'react-native'
import { WebView } from 'react-native-webview'
import { OnShouldStartLoadWithRequest } from 'react-native-webview/lib/WebViewTypes'
import {
    RequestInvoiceArgs,
    RequestInvoiceResponse,
    SendPaymentResponse,
    UnsupportedMethodError,
} from 'webln'

import { useToast } from '@fedi/common/hooks/toast'
import {
    selectActiveFederation,
    selectCurrency,
    selectFediModDebugMode,
    selectIsActiveFederationRecovering,
    selectLanguage,
    selectMatrixAuth,
    selectNostrNpub,
    selectPaymentFederation,
    selectWalletFederations,
    resetBrowserOverlayState,
    setEcashRequest,
    setInvoiceToPay,
    setLnurlAuthRequest,
    setLnurlPayment,
    setLnurlWithdrawal,
    setNostrUnsignedEvent,
    setRequestInvoiceArgs,
    refetchSiteInfo,
    selectSiteInfo,
    listGateways,
    selectIsInternetUnreachable,
    selectFediModCacheMode,
    selectFediModCacheEnabled,
} from '@fedi/common/redux'
import { AnyParsedData, Invoice, ParserDataType } from '@fedi/common/types'
import { getCurrencyCode } from '@fedi/common/utils/currency'
import { makeLog } from '@fedi/common/utils/log'
import { parseUserInput } from '@fedi/common/utils/parser'
import {
    InjectionMessageType,
    generateInjectionJs,
    makeWebViewMessageHandler,
} from '@fedi/injections'
import { SignedNostrEvent } from '@fedi/injections/src/injectables/nostr/types'

import { fedimint } from '../bridge'
import AddressBarOverlay from '../components/feature/fedimods/AddressBarOverlay'
import { AuthOverlay } from '../components/feature/fedimods/AuthOverlay'
import ExitFedimodOverlay from '../components/feature/fedimods/ExitFedimodOverlay'
import FediModBrowserHeader from '../components/feature/fedimods/FediModBrowserHeader'
import { GenerateEcashOverlay } from '../components/feature/fedimods/GenerateEcashoverlay'
import { MakeInvoiceOverlay } from '../components/feature/fedimods/MakeInvoiceOverlay'
import { NostrSignOverlay } from '../components/feature/fedimods/NostrSignOverlay'
import { SendPaymentOverlay } from '../components/feature/fedimods/SendPaymentOverlay'
import { RecoveryInProgressOverlay } from '../components/feature/recovery/RecoveryInProgressOverlay'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import {
    useOmniLinkContext,
    useOmniLinkInterceptor,
} from '../state/contexts/OmniLinkContext'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('FediModBrowser')

const HANDLED_URI_SCHEMES = [
    'fedi',
    'bitcoin',
    'lightning',
    'lnurl',
    'lnurlp',
    'lnurlw',
    'keyauth',
]
const ORIGIN_WHITELIST = [
    // Allow any HTTP(S) origins
    'http:*',
    'https:*',
    // Also allow URI schemes that will be handled in-app
    ...HANDLED_URI_SCHEMES.map(scheme => `${scheme}:*`),
]
const handledUriRegex = new RegExp(`^(${HANDLED_URI_SCHEMES.join('|')}):`, 'i')

export type Props = NativeStackScreenProps<RootStackParamList, 'FediModBrowser'>

type FediModResponse =
    | RequestInvoiceResponse
    | SendPaymentResponse
    | SignedNostrEvent
    | string
type FediModResolver<T> = (value: T | PromiseLike<T>) => void

const FediModBrowser: React.FC<Props> = ({ route }) => {
    const { url } = route.params
    const { t } = useTranslation()
    const activeFederation = useAppSelector(selectActiveFederation)
    const dispatch = useAppDispatch()
    const nostrPublic = useAppSelector(selectNostrNpub)
    const paymentFederation = useAppSelector(selectPaymentFederation)
    const member = useAppSelector(selectMatrixAuth)
    const fediModDebugMode = useAppSelector(selectFediModDebugMode)
    const fediModCacheEnabled = useAppSelector(selectFediModCacheEnabled)
    const fediModCacheMode = useAppSelector(selectFediModCacheMode)
    const currency = useAppSelector(selectCurrency)
    const language = useAppSelector(selectLanguage)
    const toast = useToast()
    const recoveryInProgress = useAppSelector(
        selectIsActiveFederationRecovering,
    )
    const siteInfo = useAppSelector(selectSiteInfo)
    const walletFederations = useAppSelector(selectWalletFederations)
    const isInternetUnreachable = useAppSelector(selectIsInternetUnreachable)
    const webview = useRef<WebView>() as MutableRefObject<WebView>
    const overlayResolveRef = useRef<
        FediModResolver<FediModResponse> | undefined
    >() as MutableRefObject<FediModResolver<FediModResponse> | undefined>
    const overlayRejectRef = useRef<(reason: Error) => void>()

    const [isParsingLink, setIsParsingLink] = useState(false)
    const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false)
    const [browserUrl, setBrowserUrl] = useState<string>(url)
    const [isBrowserLoading, setIsBrowserLoading] = useState(true)
    const [browserLoadProgress, setBrowserLoadProgress] = useState(0)

    const [showRecoveryInProgress, setShowRecoveryInProgress] =
        useState<boolean>(false)
    const { setParsedLink } = useOmniLinkContext()
    const navigation = useNavigation()

    const handleParsedLink = (parsedLink: AnyParsedData) => {
        switch (parsedLink.type) {
            case ParserDataType.LnurlWithdraw:
                recoveryInProgress
                    ? setShowRecoveryInProgress(true)
                    : dispatch(setLnurlWithdrawal(parsedLink.data))
                return true
            case ParserDataType.Bolt11:
                recoveryInProgress
                    ? setShowRecoveryInProgress(true)
                    : dispatch(setInvoiceToPay(parsedLink.data))
                return true
            case ParserDataType.LnurlPay:
                recoveryInProgress
                    ? setShowRecoveryInProgress(true)
                    : dispatch(setLnurlPayment(parsedLink.data))
                return true
            case ParserDataType.LnurlAuth:
                dispatch(setLnurlAuthRequest(parsedLink.data))
                return true
        }
        return false
    }

    // Intercept any URIs the user tries to navigate to that we can handle inline
    useOmniLinkInterceptor(handleParsedLink)

    // Handle all messages coming from a WebLN-enabled site
    const onMessage = makeWebViewMessageHandler(webview, {
        [InjectionMessageType.webln_enable]: async () => {
            /* no-op */
            log.info('webln.enable')
        },
        [InjectionMessageType.webln_getInfo]: async () => {
            log.info('webln.getInfo')

            const alias = member?.displayName || ''
            let pubkey = ''
            try {
                if (!paymentFederation?.id)
                    throw new Error('No available lightning gateways')

                const gateways = await dispatch(
                    listGateways({
                        fedimint,
                        federationId: paymentFederation?.id,
                    }),
                ).unwrap()
                const gateway = gateways.find(g => g.active) || gateways[0]

                if (gateway) {
                    pubkey = gateway.nodePubKey
                }
                return { node: { alias, pubkey } }
            } catch (err) {
                log.warn('Failed to list gateways for webln getInfo', err)
                throw new Error(t('errors.no-lightning-gateways'))
            }
        },
        [InjectionMessageType.webln_makeInvoice]: async data => {
            log.info('webln.makeInvoice', data)
            if (recoveryInProgress) {
                setShowRecoveryInProgress(true)
                throw Error(t('errors.unknown-error'))
            }

            if (walletFederations.length === 0) {
                toast.show({
                    content: t('errors.please-join-wallet-federation'),
                    status: 'error',
                })
                throw new Error(t('errors.please-join-wallet-federation'))
            }

            // Wait for user to interact with alert
            return new Promise((resolve, reject) => {
                // Save these refs to we can resolve / reject elsewhere
                overlayRejectRef.current = reject
                overlayResolveRef.current =
                    resolve as FediModResolver<FediModResponse>

                // TODO: Consider removing this since seeing a string or number
                // is not strictly WebLN-compliant but inferring an amount might
                // be convenient
                if (typeof data === 'string' || typeof data === 'number') {
                    dispatch(setRequestInvoiceArgs({ amount: data }))
                } else {
                    // Handle WebLN-compliant payload
                    dispatch(setRequestInvoiceArgs(data as RequestInvoiceArgs))
                }
            })
        },
        [InjectionMessageType.webln_sendPayment]: async data => {
            log.info('webln.sendPayment', data)
            if (recoveryInProgress) {
                setShowRecoveryInProgress(true)
                throw Error(t('errors.unknown-error'))
            }

            if (walletFederations.length === 0) {
                toast.show({
                    content: t('errors.please-join-wallet-federation'),
                    status: 'error',
                })
                // Don't duplicate errors we display via toasts
                throw new Error(t('errors.failed-to-send-payment'))
            }

            let invoice: Invoice
            try {
                invoice = await fedimint.decodeInvoice(
                    data,
                    paymentFederation?.id ?? null,
                )
            } catch (error) {
                log.error('sendPayment', 'error', error)
                toast.show({
                    content: t('phrases.failed-to-decode-invoice'),
                    status: 'error',
                })
                // Don't duplicate errors we display via toasts
                throw Error(t('errors.failed-to-send-payment'))
            }
            // Wait for user to interact with alert
            return new Promise((resolve, reject) => {
                overlayRejectRef.current = reject
                overlayResolveRef.current =
                    resolve as FediModResolver<FediModResponse>
                dispatch(setInvoiceToPay(invoice))
            })
        },
        [InjectionMessageType.webln_signMessage]: async () => {
            log.info('webln.signMessage')
            throw new UnsupportedMethodError(
                t('errors.webln-method-not-supported', {
                    method: 'signMessage',
                }),
            )
        },
        [InjectionMessageType.webln_verifyMessage]: async () => {
            log.info('webln.verifyMessage')
            throw new UnsupportedMethodError(
                t('errors.webln-method-not-supported', {
                    method: 'verifyMessage',
                }),
            )
        },
        [InjectionMessageType.webln_keysend]: async () => {
            log.info('webln.keysend')
            throw new UnsupportedMethodError(
                t('errors.webln-method-not-supported', {
                    method: 'keysend',
                }),
            )
        },
        [InjectionMessageType.nostr_getPublicKey]: async () => {
            log.info('nostr.getPublicKey')

            if (!nostrPublic) {
                throw new Error(t('errors.get-nostr-pubkey-failed'))
            }

            return nostrPublic.hex
        },
        [InjectionMessageType.nostr_signEvent]: async evt => {
            log.info('nostr.signEvent', evt)
            // Wait for user to approve signing
            return new Promise<SignedNostrEvent>((resolve, reject) => {
                overlayRejectRef.current = reject
                overlayResolveRef.current =
                    resolve as FediModResolver<FediModResponse>
                dispatch(setNostrUnsignedEvent(evt))
            })
        },
        [InjectionMessageType.nostr_encrypt]: async ({ pubkey, plaintext }) => {
            log.info('nostr.encrypt', pubkey, plaintext)
            const encrypted = await fedimint.nostrEncrypt(pubkey, plaintext)
            return encrypted
        },
        [InjectionMessageType.nostr_decrypt]: async ({
            pubkey,
            ciphertext,
        }) => {
            log.info('nostr.decrypt', pubkey, ciphertext)
            const decrypted = await fedimint.nostrDecrypt(pubkey, ciphertext)
            return decrypted
        },
        [InjectionMessageType.fedi_generateEcash]: async ecashRequestArgs => {
            log.info('fedi.generateEcash', ecashRequestArgs)

            // Wait for user to interact with alert
            return new Promise((resolve, reject) => {
                // Save these refs so we can resolve / reject elsewhere
                overlayRejectRef.current = reject
                overlayResolveRef.current =
                    resolve as unknown as FediModResolver<FediModResponse>

                dispatch(setEcashRequest(ecashRequestArgs))
            })
        },
        [InjectionMessageType.fedi_receiveEcash]: async ecash => {
            log.info('fedi.receiveEcash', ecash)
            if (activeFederation?.id === undefined) {
                log.error('fedi.receiveEcash', 'No active federation')
                throw new Error('No active federation')
            }
            try {
                const res = await fedimint.receiveEcash(
                    ecash,
                    activeFederation.id,
                )
                return { msats: res[0] }
            } catch (err) {
                log.warn('fedi.receiveEcash', err)
                throw new Error(t('errors.receive-ecash-failed'))
            }
        },
        [InjectionMessageType.fedi_getAuthenticatedMember]: async () => {
            log.info('fedi.getAuthenticatedMember')

            if (!member) {
                throw new Error('No authenticated member')
            }

            return {
                id: member.userId,
                username: member.displayName,
            }
        },
        [InjectionMessageType.fedi_getActiveFederation]: async () => {
            log.info('fedi.getActiveFederation')

            if (!activeFederation) {
                throw new Error('No active federation')
            }

            return {
                id: activeFederation.id,
                name: activeFederation.name,
                network: activeFederation.hasWallet
                    ? activeFederation.network
                    : undefined,
            }
        },
        [InjectionMessageType.fedi_getCurrencyCode]: async () => {
            log.info('fedi.getActiveFederation')

            return getCurrencyCode(currency)
        },
        [InjectionMessageType.fedi_getLanguageCode]: async () => {
            log.info('fedi.getActiveFederation')

            return language ?? 'en'
        },
    })

    // Decide whether or not to handle links clicked in the webview natively.
    // Links that are passed to this are decided based on the `originWhitelist`
    // param below. Any URI that does not match that whitelist should be
    // automitaclly handled by the OS webview.
    const onShouldStartLoadWithRequest: OnShouldStartLoadWithRequest = req => {
        // Unless it's a URI we're handling in-app, allow the webview to handle it.
        if (!handledUriRegex.test(req.url)) return true
        // Otherwise, optimistically block it and attempt to parse whatever it was.
        // If it can be handled inline by the FediModBrowser, do that. If it can
        // be handled elsewhere in the app, pass it to the OmniLinkContext. If it
        // can't be parsed, pass it on to the OS to decide how to handle it.
        setIsParsingLink(true)
        parseUserInput(
            req.url,
            fedimint,
            t,
            activeFederation?.id,
            isInternetUnreachable,
        )
            .then(parsed => {
                const handled = handleParsedLink(parsed)
                if (handled) return
                if (parsed.type !== ParserDataType.Unknown) {
                    setParsedLink(parsed)
                } else {
                    Linking.openURL(req.url)
                }
            })
            .finally(() => {
                setIsParsingLink(false)
            })
        return false
    }

    const resetOverlay = () => {
        dispatch(resetBrowserOverlayState())
        setShowRecoveryInProgress(false)
    }

    const overlayProps = {
        onReject: (err: Error) => {
            if (err && overlayRejectRef.current) {
                overlayRejectRef.current(err)
            }
            resetOverlay()
        },
        onAccept: (res?: FediModResponse) => {
            if (res && overlayResolveRef.current) {
                overlayResolveRef.current(res)
            }
            resetOverlay()
        },
    }

    let uri = browserUrl
    // TODO: Remove me after alpha, just to get webln working on faucet.
    if (uri.includes('https://faucet.mutinynet.dev.fedibtc.com')) {
        uri = `${uri}${uri.includes('?') ? '&' : '?'}webln=1`
    }

    // Handle back button press on Android
    useEffect(() => {
        const backAction = () => {
            setConfirmLeaveOpen(true)

            return true
        }

        const backHandler = BackHandler.addEventListener(
            'hardwareBackPress',
            backAction,
        )

        return () => backHandler.remove()
    }, [navigation, t])

    useEffect(() => {
        setBrowserUrl(url)
    }, [url])

    return (
        <SafeAreaContainer edges="vertical">
            <WebView
                ref={webview}
                webviewDebuggingEnabled={fediModDebugMode} // required for IOS debugging
                cacheEnabled={fediModCacheEnabled || true}
                cacheMode={fediModCacheMode || 'LOAD_DEFAULT'}
                source={{ uri }}
                injectedJavaScriptBeforeContentLoaded={generateInjectionJs({
                    webln: true,
                    eruda: fediModDebugMode,
                    nostr: true,
                    fediInternal: true,
                })}
                allowsInlineMediaPlayback
                onMessage={onMessage}
                onLoadStart={() => {
                    setIsBrowserLoading(true)
                }}
                onLoadProgress={e => {
                    setBrowserLoadProgress(e.nativeEvent.progress)
                }}
                onLoadEnd={() => {
                    const resolvedUrl = /https?:\/\//.test(uri)
                        ? uri
                        : `https://${uri}`

                    try {
                        const validUrl = new URL(resolvedUrl)
                        const siteUrl = siteInfo ? new URL(siteInfo.url) : null

                        if (validUrl.hostname !== siteUrl?.hostname) {
                            dispatch(refetchSiteInfo({ url: resolvedUrl }))
                        }
                    } catch {
                        /* no-op */
                    } finally {
                        setIsBrowserLoading(false)
                    }
                }}
                onNavigationStateChange={e => {
                    setBrowserUrl(e.url)
                }}
                onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
                style={{ width: '100%', height: '100%', flex: 1 }}
                originWhitelist={ORIGIN_WHITELIST}
                pullToRefreshEnabled
            />
            <FediModBrowserHeader
                webViewRef={webview}
                isBrowserLoading={isBrowserLoading}
                browserLoadProgress={browserLoadProgress}
                currentUrl={uri}
            />
            {isParsingLink && (
                <View style={style.loadingOverlay}>
                    <ActivityIndicator color="#FFF" />
                </View>
            )}
            <MakeInvoiceOverlay {...overlayProps} />
            <SendPaymentOverlay {...overlayProps} />
            <AuthOverlay {...overlayProps} />
            <NostrSignOverlay {...overlayProps} />
            <RecoveryInProgressOverlay
                show={showRecoveryInProgress}
                onDismiss={overlayProps.onAccept}
                label={t('feature.recovery.recovery-in-progress-payments')}
            />
            <GenerateEcashOverlay
                onReject={overlayProps.onReject}
                onAccept={overlayProps.onAccept}
            />
            <ExitFedimodOverlay
                open={confirmLeaveOpen}
                onOpenChange={setConfirmLeaveOpen}
            />
            <AddressBarOverlay setBrowserUrl={setBrowserUrl} />
        </SafeAreaContainer>
    )
}

const style = StyleSheet.create({
    loadingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
    },
})

export default FediModBrowser
