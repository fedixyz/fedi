import { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { MutableRefObject, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native'
import { EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import { OnShouldStartLoadWithRequest } from 'react-native-webview/lib/WebViewTypes'
import {
    RequestInvoiceArgs,
    RequestInvoiceResponse,
    SendPaymentResponse,
    UnsupportedMethodError,
} from 'webln'

import {
    useIsFediInternalInjectionEnabled,
    useIsNostrEnabled,
} from '@fedi/common/hooks/federation'
import { useToast } from '@fedi/common/hooks/toast'
import {
    selectActiveFederation,
    selectAuthenticatedMember,
    selectFediModDebugMode,
    selectIsActiveFederationRecovering,
} from '@fedi/common/redux'
import {
    AnyParsedData,
    EcashRequest,
    Invoice,
    MSats,
    ParsedLnurlAuth,
    ParsedLnurlPay,
    ParsedLnurlWithdraw,
    ParserDataType,
} from '@fedi/common/types'
import { RpcLightningGateway } from '@fedi/common/types/bindings'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { makeLog } from '@fedi/common/utils/log'
import { parseUserInput } from '@fedi/common/utils/parser'
import {
    InjectionMessageType,
    generateInjectionJs,
    makeWebViewMessageHandler,
} from '@fedi/injections'
import {
    SignedNostrEvent,
    UnsignedNostrEvent,
} from '@fedi/injections/src/injectables/nostr/types'

import { fedimint } from '../bridge'
import { AuthOverlay } from '../components/feature/fedimods/AuthOverlay'
import FediModBrowserHeader from '../components/feature/fedimods/FediModBrowserHeader'
import { GenerateEcashOverlay } from '../components/feature/fedimods/GenerateEcashoverlay'
import { MakeInvoiceOverlay } from '../components/feature/fedimods/MakeInvoiceOverlay'
import { NostrSignOverlay } from '../components/feature/fedimods/NostrSignOverlay'
import { SendPaymentOverlay } from '../components/feature/fedimods/SendPaymentOverlay'
import { RecoveryInProgressOverlay } from '../components/feature/recovery/RecoveryInProgressOverlay'
import {
    useOmniLinkContext,
    useOmniLinkInterceptor,
} from '../state/contexts/OmniLinkContext'
import { useAppSelector, useBridge } from '../state/hooks'
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
    const { fediMod } = route.params
    const { listGateways, getNostrPubKey } = useBridge()
    const insets = useSafeAreaInsets()
    const { t } = useTranslation()
    const activeFederation = useAppSelector(selectActiveFederation)
    const authenticatedMember = useAppSelector(selectAuthenticatedMember)
    const fediModDebugMode = useAppSelector(selectFediModDebugMode)
    const nostrEnabled = useIsNostrEnabled()
    const fediInternalEnabled = useIsFediInternalInjectionEnabled()
    const toast = useToast()
    const recoveryInProgress = useAppSelector(
        selectIsActiveFederationRecovering,
    )
    const webview = useRef<WebView>() as MutableRefObject<WebView>
    const overlayResolveRef = useRef<
        FediModResolver<FediModResponse> | undefined
    >() as MutableRefObject<FediModResolver<FediModResponse> | undefined>
    const overlayRejectRef = useRef<(reason: Error) => void>()

    const [requestInvoiceArgs, setRequestInvoiceArgs] =
        useState<RequestInvoiceArgs | null>(null)
    const [lnurlWithdrawal, setLnurlWithdrawal] = useState<
        ParsedLnurlWithdraw['data'] | null
    >(null)
    const [invoiceToPay, setInvoiceToPay] = useState<Invoice | null>(null)
    const [lnurlPayment, setLnurlPayment] = useState<
        ParsedLnurlPay['data'] | null
    >(null)
    const [lnurlAuthRequest, setLnurlAuthRequest] = useState<
        ParsedLnurlAuth['data'] | null
    >(null)
    const [nostrUnsignedEvent, setNostrUnsignedEvent] =
        useState<UnsignedNostrEvent | null>(null)
    const [isParsingLink, setIsParsingLink] = useState(false)
    const [ecashRequest, setEcashRequest] = useState<EcashRequest | null>(null)

    const getActiveGatewayPromiseRef =
        useRef<Promise<RpcLightningGateway> | null>(null)
    const [showRecoveryInProgress, setShowRecoveryInProgress] =
        useState<boolean>(false)
    const { setParsedLink } = useOmniLinkContext()

    const handleParsedLink = (parsedLink: AnyParsedData) => {
        switch (parsedLink.type) {
            case ParserDataType.LnurlWithdraw:
                recoveryInProgress
                    ? setShowRecoveryInProgress(true)
                    : setLnurlWithdrawal(parsedLink.data)
                return true
            case ParserDataType.Bolt11:
                recoveryInProgress
                    ? setShowRecoveryInProgress(true)
                    : setInvoiceToPay(parsedLink.data)
                return true
            case ParserDataType.LnurlPay:
                recoveryInProgress
                    ? setShowRecoveryInProgress(true)
                    : setLnurlPayment(parsedLink.data)
                return true
            case ParserDataType.LnurlAuth:
                setLnurlAuthRequest(parsedLink.data)
                return true
        }
        return false
    }

    // Intercept any URIs the user tries to navigate to that we can handle inline
    useOmniLinkInterceptor(handleParsedLink)

    const getActiveGatewayOrThrow = async () => {
        log.info('getActiveGatewayOrThrow')
        if (getActiveGatewayPromiseRef.current)
            return getActiveGatewayPromiseRef.current
        getActiveGatewayPromiseRef.current = listGateways().then(gateways => {
            if (!gateways.length) {
                log.info('No available lightning gateways')
                throw new Error('No available lightning gateways')
            }
            return gateways.find(g => g.active) || gateways[0]
        })
        return getActiveGatewayPromiseRef.current
    }

    // Handle all messages coming from a WebLN-enabled site
    const onMessage = makeWebViewMessageHandler(webview, {
        [InjectionMessageType.webln_enable]: async () => {
            /* no-op */
            log.info('webln.enable')
        },
        [InjectionMessageType.webln_getInfo]: async () => {
            log.info('webln.getInfo')

            const alias = authenticatedMember?.username || ''
            let pubkey = ''
            try {
                const gateway = await getActiveGatewayOrThrow()

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
            // Check for an active gateway or throw error
            await getActiveGatewayOrThrow()

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
                    setRequestInvoiceArgs({ amount: data })
                } else {
                    // Handle WebLN-compliant payload
                    setRequestInvoiceArgs(data as RequestInvoiceArgs)
                }
            })
        },
        [InjectionMessageType.webln_sendPayment]: async data => {
            log.info('webln.sendPayment', data)
            if (recoveryInProgress) {
                setShowRecoveryInProgress(true)
                throw Error(t('errors.unknown-error'))
            }
            if (activeFederation?.id === undefined) {
                log.error('fedi.decodeInvoice', 'No active federation')
                throw new Error('No active federation')
            }
            // Check for an active gateway or throw error
            await getActiveGatewayOrThrow()

            let invoice: Invoice
            try {
                invoice = await fedimint.decodeInvoice(
                    data,
                    activeFederation.id,
                )
            } catch (error) {
                log.error('sendPayment', 'error', error)
                toast.show({
                    content: t('phrases.failed-to-decode-invoice'),
                    status: 'error',
                })
                throw Error(t('phrases.failed-to-decode-invoice'))
            }
            // Wait for user to interact with alert
            return new Promise((resolve, reject) => {
                if (!activeFederation)
                    return reject(new Error('No active federation'))
                // TODO: Hoist this to respect balance changes
                if (activeFederation.balance < invoice.amount) {
                    const message = t('errors.insufficient-balance', {
                        balance: `${amountUtils.msatToSat(
                            activeFederation?.balance as MSats,
                        )} SATS`,
                    })
                    toast.show({ content: message, status: 'error' })
                    reject(new Error(message))
                } else {
                    // Save these refs to we can resolve / reject elsewhere
                    overlayRejectRef.current = reject
                    overlayResolveRef.current =
                        resolve as FediModResolver<FediModResponse>
                    setInvoiceToPay(invoice)
                }
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
            try {
                const pub_key = await getNostrPubKey()
                return pub_key
            } catch (err) {
                log.warn('nostr.getPublicKey', err)
                throw new Error(t('errors.get-nostr-pubkey-failed'))
            }
        },
        [InjectionMessageType.nostr_signEvent]: async evt => {
            log.info('nostr.signEvent', evt)
            // Wait for user to approve signing
            return new Promise<SignedNostrEvent>((resolve, reject) => {
                overlayRejectRef.current = reject
                overlayResolveRef.current =
                    resolve as FediModResolver<FediModResponse>
                setNostrUnsignedEvent(evt)
            })
        },
        [InjectionMessageType.fedi_generateEcash]: async ecashRequestArgs => {
            log.info('fedi.generateEcash', ecashRequestArgs)

            if (activeFederation?.id === undefined) {
                log.error('fedi.generateEcash', 'No active federation')
                throw new Error('No active federation')
            }

            // Wait for user to interact with alert
            return new Promise((resolve, reject) => {
                // Save these refs so we can resolve / reject elsewhere
                overlayRejectRef.current = reject
                overlayResolveRef.current =
                    resolve as unknown as FediModResolver<FediModResponse>

                setEcashRequest(ecashRequestArgs)
            })
        },
        [InjectionMessageType.fedi_receiveEcash]: async ecash => {
            log.info('fedi.receiveEcash', ecash)
            if (activeFederation?.id === undefined) {
                log.error('fedi.receiveEcash', 'No active federation')
                throw new Error('No active federation')
            }
            try {
                const msats = await fedimint.receiveEcash(
                    ecash,
                    activeFederation.id,
                )
                return { msats }
            } catch (err) {
                log.warn('fedi.receiveEcash', err)
                throw new Error(t('errors.receive-ecash-failed'))
            }
        },
        [InjectionMessageType.fedi_getAuthenticatedMember]: async () => {
            log.info('fedi.getAuthenticatedMember')

            if (!authenticatedMember) {
                throw new Error('No authenticated member')
            }

            return {
                id: authenticatedMember.id,
                username: authenticatedMember.username,
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
                network: activeFederation.network,
            }
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
        parseUserInput(req.url, fedimint, t, activeFederation?.id)
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
        setRequestInvoiceArgs(null)
        setLnurlWithdrawal(null)
        setInvoiceToPay(null)
        setLnurlPayment(null)
        setLnurlAuthRequest(null)
        setNostrUnsignedEvent(null)
        setShowRecoveryInProgress(false)
        setEcashRequest(null)
    }

    const overlayProps = {
        fediMod,
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

    let uri = fediMod.url
    // TODO: Remove me after alpha, just to get webln working on faucet.
    if (uri.includes('https://faucet.mutinynet.dev.fedibtc.com')) {
        uri = `${uri}${uri.includes('?') ? '&' : '?'}webln=1`
    }

    const style = styles(insets)

    return (
        <View style={style.container}>
            <FediModBrowserHeader webViewRef={webview} fediMod={fediMod} />
            <WebView
                ref={webview}
                webviewDebuggingEnabled={fediModDebugMode} // required for IOS debugging
                source={{ uri }}
                injectedJavaScriptBeforeContentLoaded={generateInjectionJs({
                    webln: true,
                    eruda: fediModDebugMode,
                    nostr: nostrEnabled,
                    fediInternal: fediInternalEnabled,
                })}
                allowsInlineMediaPlayback
                onMessage={onMessage}
                onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
                style={{ width: '100%', height: '100%', flex: 1 }}
                originWhitelist={ORIGIN_WHITELIST}
            />
            {isParsingLink && (
                <View style={style.loadingOverlay}>
                    <ActivityIndicator color="#FFF" />
                </View>
            )}
            <MakeInvoiceOverlay
                {...overlayProps}
                requestInvoiceArgs={requestInvoiceArgs}
                lnurlWithdrawal={lnurlWithdrawal}
            />
            <SendPaymentOverlay
                {...overlayProps}
                invoice={invoiceToPay}
                lnurlPayment={lnurlPayment}
            />
            <AuthOverlay
                {...overlayProps}
                lnurlAuthRequest={lnurlAuthRequest}
            />
            <NostrSignOverlay
                {...overlayProps}
                nostrEvent={nostrUnsignedEvent}
            />
            <RecoveryInProgressOverlay
                show={showRecoveryInProgress}
                onDismiss={overlayProps.onAccept}
                label={t('feature.recovery.recovery-in-progress-payments')}
            />
            <GenerateEcashOverlay
                onReject={overlayProps.onReject}
                onAccept={overlayProps.onAccept}
                ecashRequest={ecashRequest}
            />
        </View>
    )
}

const styles = (insets: EdgeInsets) =>
    StyleSheet.create({
        container: {
            flex: 1,
            paddingBottom: insets.bottom,
        },
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
