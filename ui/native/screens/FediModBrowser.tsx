import { useNavigation } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
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

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useInjectionsPermissions } from '@fedi/common/hooks/injections'
import { useToast } from '@fedi/common/hooks/toast'
import {
    selectCurrency,
    selectFediModDebugMode,
    selectLanguage,
    selectMatrixAuth,
    selectNostrNpub,
    selectPaymentFederation,
    selectLoadedFederations,
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
    selectAreAllFederationsRecovering,
    joinCommunity,
    setLastSelectedCommunityId,
    selectCommunities,
    refreshCommunities,
    selectRequestedPermission,
    selectCurrentUrl,
    setCurrentUrl,
    commitUrlToHistory,
    selectMatrixRooms,
} from '@fedi/common/redux'
import { addCustomMod, selectConfigurableMods } from '@fedi/common/redux/mod'
import {
    AnyParsedData,
    InstallMiniAppRequest,
    Invoice,
    MSats,
    ParserDataType,
} from '@fedi/common/types'
import { getCurrencyCode } from '@fedi/common/utils/currency'
import { prepareCreateCommunityPayload } from '@fedi/common/utils/fedimods'
import { makeLog } from '@fedi/common/utils/log'
import { isBolt11, parseUserInput } from '@fedi/common/utils/parser'
import {
    InjectionMessageType,
    generateInjectionJs,
    makeWebViewMessageHandler,
} from '@fedi/injections'
import { SignedNostrEvent } from '@fedi/injections/src/injectables/nostr/types'

import AddressBarOverlay from '../components/feature/fedimods/AddressBarOverlay'
import { AuthOverlay } from '../components/feature/fedimods/AuthOverlay'
import ExitFedimodOverlay from '../components/feature/fedimods/ExitFedimodOverlay'
import FediModBrowserHeader from '../components/feature/fedimods/FediModBrowserHeader'
import { GenerateEcashOverlay } from '../components/feature/fedimods/GenerateEcashoverlay'
import { MakeInvoiceOverlay } from '../components/feature/fedimods/MakeInvoiceOverlay'
import { NostrSignOverlay } from '../components/feature/fedimods/NostrSignOverlay'
import { SelectPublicChatsOverlay } from '../components/feature/fedimods/SelectPublicChats'
import { SendPaymentOverlay } from '../components/feature/fedimods/SendPaymentOverlay'
import { RecoveryInProgressOverlay } from '../components/feature/recovery/RecoveryInProgressOverlay'
import RequestPermissionOverlay from '../components/ui/RequestPermissionOverlay'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import {
    useOmniLinkContext,
    useOmniLinkInterceptor,
} from '../state/contexts/OmniLinkContext'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { reset, resetToMiniapps } from '../state/navigation'
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
    | Array<string>
    | boolean

type FediModResolver<T> = (value: T | PromiseLike<T>) => void

const FediModBrowser: React.FC<Props> = () => {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const nostrPublic = useAppSelector(selectNostrNpub)
    const paymentFederation = useAppSelector(selectPaymentFederation)
    const member = useAppSelector(selectMatrixAuth)
    const fediModDebugMode = useAppSelector(selectFediModDebugMode)
    const fediModCacheEnabled = useAppSelector(selectFediModCacheEnabled)
    const fediModCacheMode = useAppSelector(selectFediModCacheMode)
    const currency = useAppSelector(selectCurrency)
    const language = useAppSelector(selectLanguage)
    const installedMiniApps = useAppSelector(selectConfigurableMods)
    const requestedPermission = useAppSelector(selectRequestedPermission)
    const toast = useToast()
    const areAllFederationsRecovering = useAppSelector(
        selectAreAllFederationsRecovering,
    )
    const siteInfo = useAppSelector(selectSiteInfo)
    const walletFederations = useAppSelector(selectLoadedFederations)
    const communities = useAppSelector(selectCommunities)
    const isInternetUnreachable = useAppSelector(selectIsInternetUnreachable)
    const currentUrl = useAppSelector(selectCurrentUrl)
    const chats = useAppSelector(selectMatrixRooms)

    const webview = useRef<WebView | null>(null)
    const overlayResolveRef = useRef<
        FediModResolver<FediModResponse> | undefined
    >(undefined)
    const overlayRejectRef = useRef<((reason: Error) => void) | undefined>(
        undefined,
    )

    const [isParsingLink, setIsParsingLink] = useState(false)
    const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false)
    const [isBrowserLoading, setIsBrowserLoading] = useState(true)
    const [browserLoadProgress, setBrowserLoadProgress] = useState(0)
    const [isSelectingPublicChats, setIsSelectingPublicChats] = useState(false)

    const [showRecoveryInProgress, setShowRecoveryInProgress] =
        useState<boolean>(false)
    const { setParsedLink } = useOmniLinkContext()
    const navigation = useNavigation()

    const handleParsedLink = (parsedLink: AnyParsedData) => {
        switch (parsedLink.type) {
            case ParserDataType.LnurlWithdraw:
                areAllFederationsRecovering
                    ? setShowRecoveryInProgress(true)
                    : dispatch(setLnurlWithdrawal(parsedLink.data))
                return true
            case ParserDataType.Bolt11:
                areAllFederationsRecovering
                    ? setShowRecoveryInProgress(true)
                    : dispatch(setInvoiceToPay(parsedLink.data))
                return true
            case ParserDataType.LnurlPay:
                areAllFederationsRecovering
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

    const { validatePermissions, handlePermissionResponse } =
        useInjectionsPermissions({
            // use the overlay refs to prompt the user for permission
            // resolves on allow, rejects on deny
            onPermissionNeeded: async (): Promise<void> => {
                return new Promise<void>((resolve, reject) => {
                    overlayResolveRef.current =
                        resolve as unknown as FediModResolver<FediModResponse>
                    overlayRejectRef.current = reject
                })
            },
            onPermissionDenied: (permission, miniAppName) => {
                toast.show({
                    content: t(
                        'feature.fedimods.missing-mini-app-permissions',
                        {
                            miniAppName,
                            missingPermissions: permission,
                        },
                    ),
                })
            },
        })

    // Handle all messages coming from a WebLN-enabled site
    const onMessage = makeWebViewMessageHandler(
        webview,
        [validatePermissions],
        {
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
                if (areAllFederationsRecovering) {
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
                        dispatch(
                            setRequestInvoiceArgs(data as RequestInvoiceArgs),
                        )
                    }
                })
            },
            [InjectionMessageType.webln_sendPayment]: async data => {
                log.info('webln.sendPayment', data)
                if (areAllFederationsRecovering) {
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
                // only do a basic parsing check, decoding happens in the SendPaymentOverlay
                if (isBolt11(data)) {
                    invoice = {
                        invoice: data,
                        // these fake fields will get overwritten when we decode the invoice
                        paymentHash: '',
                        amount: 0 as MSats,
                        fee: null,
                        description: '',
                    }
                } else {
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
            [InjectionMessageType.nostr_encrypt]: async ({
                pubkey,
                plaintext,
            }) => {
                log.info('nostr.encrypt', pubkey, plaintext)
                const encrypted = await fedimint.nostrEncrypt(pubkey, plaintext)
                return encrypted
            },
            [InjectionMessageType.nostr_decrypt]: async ({
                pubkey,
                ciphertext,
            }) => {
                log.info('nostr.decrypt', pubkey, ciphertext)
                const decrypted = await fedimint.nostrDecrypt(
                    pubkey,
                    ciphertext,
                )
                return decrypted
            },
            [InjectionMessageType.nostr_encrypt04]: async ({
                pubkey,
                plaintext,
            }) => {
                log.info('nostr.encrypt04', pubkey, plaintext)
                const encrypted = await fedimint.nostrEncrypt04(
                    pubkey,
                    plaintext,
                )
                return encrypted
            },
            [InjectionMessageType.nostr_decrypt04]: async ({
                pubkey,
                ciphertext,
            }) => {
                log.info('nostr.decrypt04', pubkey, ciphertext)
                const decrypted = await fedimint.nostrDecrypt04(
                    pubkey,
                    ciphertext,
                )
                return decrypted
            },
            [InjectionMessageType.fedi_generateEcash]:
                async ecashRequestArgs => {
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
                if (paymentFederation?.id === undefined) {
                    log.error('fedi.receiveEcash', 'No active federation')
                    throw new Error('No active federation')
                }
                try {
                    const res = await fedimint.receiveEcash(
                        ecash,
                        paymentFederation.id,
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
            [InjectionMessageType.fedi_getCurrencyCode]: async () => {
                log.info('fedi.fedi_getCurrencyCode')

                return getCurrencyCode(currency)
            },
            [InjectionMessageType.fedi_getLanguageCode]: async () => {
                log.info('fedi.fedi_getLanguageCode')

                return language ?? 'en'
            },
            [InjectionMessageType.fedi_listCreatedCommunities]: async () => {
                try {
                    const createdCommunities =
                        await fedimint.listCreatedCommunities()
                    return { communities: createdCommunities }
                } catch (err) {
                    log.error('fedi.fedi_listCreatedCommunities', err)
                    throw new Error(
                        t('errors.failed-to-list-created-communities'),
                    )
                }
            },
            [InjectionMessageType.fedi_createCommunity]: async community => {
                log.info('fedi.fedi_createCommunity', community)
                try {
                    const communityToCreate =
                        prepareCreateCommunityPayload(community)
                    const createdCommunity =
                        await fedimint.createCommunity(communityToCreate)
                    const inviteCode =
                        createdCommunity.communityInvite.invite_code_str
                    // TODO: consider joining here? or exposing joinCommunity so the miniApp can do it
                    return { success: true, inviteCode }
                } catch (err) {
                    log.error('fedi.fedi_createCommunity', err)
                    throw new Error(t('errors.failed-to-create-community'))
                }
            },
            [InjectionMessageType.fedi_editCommunity]: async community => {
                log.info('fedi.fedi_editCommunity', community)
                try {
                    const communityToEdit = prepareCreateCommunityPayload(
                        community.editedCommunity,
                    )
                    await fedimint.editCommunity(
                        community.communityId,
                        communityToEdit,
                    )
                    return { success: true }
                } catch (err) {
                    log.error('fedi.fedi_editCommunity', err)
                    throw new Error(t('errors.failed-to-edit-community'))
                }
            },
            [InjectionMessageType.fedi_joinCommunity]: async inviteCode => {
                log.info('fedi.fedi_joinCommunity', inviteCode)
                try {
                    const joinedCommunity = await dispatch(
                        joinCommunity({ fedimint, code: inviteCode }),
                    ).unwrap()
                    return { success: true, community: joinedCommunity }
                } catch (err) {
                    log.error('fedi.fedi_joinCommunity', err)
                    throw new Error(t('errors.failed-to-join-community'))
                }
            },
            [InjectionMessageType.fedi_setSelectedCommunity]: async id => {
                log.info('fedi.fedi_setSelectedCommunity', id)
                try {
                    // make sure the user is joined before changing the last selected community
                    const joinedCommunity = communities.find(c => c.id === id)
                    if (joinedCommunity) {
                        dispatch(setLastSelectedCommunityId(id))
                        return { success: true }
                    } else {
                        return {
                            success: false,
                            errors: {
                                community: [
                                    t(
                                        'errors.failed-to-set-selected-community',
                                    ),
                                ],
                            },
                        }
                    }
                } catch (err) {
                    log.error('fedi.fedi_setSelectedCommunity', err)
                    throw new Error(
                        t('errors.failed-to-set-selected-community'),
                    )
                }
            },
            [InjectionMessageType.fedi_refreshCommunities]: async () => {
                log.info('fedi.fedi_refreshCommunities')
                try {
                    await dispatch(refreshCommunities(fedimint))
                } catch (err) {
                    log.error('fedi.fedi_refreshCommunities', err)
                    throw new Error(t('errors.failed-to-refresh-communities'))
                }
            },
            [InjectionMessageType.fedi_selectPublicChats]: async () => {
                log.info('fedi.fedi_selectPublicChats')
                return new Promise((resolve, reject) => {
                    overlayRejectRef.current = reject
                    overlayResolveRef.current =
                        resolve as FediModResolver<FediModResponse>
                    setIsSelectingPublicChats(true)
                })
            },
            [InjectionMessageType.fedi_navigateHome]: async () => {
                log.info('fedi.fedi_navigateHome')
                navigation.dispatch(
                    reset('TabsNavigator', { initialRouteName: 'Home' }),
                )
            },
            [InjectionMessageType.fedi_getInstalledMiniApps]: async () => {
                log.info('fedi.fedi_getInstalledMiniApps')
                return installedMiniApps.map(mod => {
                    return {
                        url: mod.url,
                    }
                })
            },
            [InjectionMessageType.fedi_installMiniApp]: async (
                miniAppToInstall: InstallMiniAppRequest,
            ) => {
                log.info('fedi.fedi_installMiniApp', miniAppToInstall)
                try {
                    await dispatch(
                        addCustomMod({
                            fediMod: {
                                id: miniAppToInstall.id,
                                title: miniAppToInstall.title,
                                url: miniAppToInstall.url,
                                imageUrl: miniAppToInstall.imageUrl,
                            },
                        }),
                    )

                    toast.show({
                        content: t('feature.fedimods.add-mini-app-success', {
                            miniAppName: miniAppToInstall.title,
                        }),
                        status: 'success',
                    })
                } catch (err) {
                    log.warn('failed to install fedi mod', err)
                    toast.show({
                        content: t('feature.fedimods.add-mini-app-failure', {
                            miniAppName: miniAppToInstall.title,
                        }),
                        status: 'error',
                    })
                }
            },
            [InjectionMessageType.fedi_previewMatrixRoom]: async (
                chatId: string,
            ) => {
                log.info('fedi.fedi_previewMatrixRoom')
                const room = chats.find(
                    chat => chat.isPublic && chat.id === chatId,
                )
                return room
                    ? {
                          name: room.name,
                          avatarUrl: room.avatarUrl,
                      }
                    : null
            },
        },
    )

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
            paymentFederation?.id || '',
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

    // when navigating away from this screen, we call onAppForeground
    // so that edits made in the community tool to any joined communities
    // reflect right away in the UI
    // this is kind of a hack, but it also seems like somewhat sensible behavior
    // anyway since in a way we are re-entering the native app context after
    // being inside a browser context.
    useEffect(() => {
        return () => {
            fedimint.onAppForeground()
        }
    }, [fedimint])

    // If currentUrl is null, navigate back to Mods screen
    // This shouldn't happen in normal use, but handles edge cases
    useLayoutEffect(() => {
        if (!currentUrl) {
            log.warn('currentUrl is null, navigating to Mods screen')
            navigation.dispatch(resetToMiniapps())
        }
    }, [currentUrl, navigation])

    if (!currentUrl) {
        log.warn('currentUrl is null, returning null')
        return null
    }

    return (
        <SafeAreaContainer edges="vertical">
            <WebView
                ref={webview}
                webviewDebuggingEnabled={fediModDebugMode} // required for IOS debugging
                cacheEnabled={fediModCacheEnabled || true}
                cacheMode={fediModCacheMode || 'LOAD_DEFAULT'}
                source={{ uri: currentUrl }}
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
                    const resolvedUrl = /https?:\/\//.test(currentUrl)
                        ? currentUrl
                        : `https://${currentUrl}`

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

                    log.info('done loading', resolvedUrl)
                    dispatch(commitUrlToHistory())
                }}
                onNavigationStateChange={e => {
                    // Skip if URL hasn't changed
                    if (e.url === currentUrl) {
                        return
                    }
                    dispatch(setCurrentUrl({ url: e.url }))
                }}
                onOpenWindow={e => {
                    log.info(
                        `${currentUrl} opening new window with URL ${e.nativeEvent.targetUrl}`,
                    )
                    Linking.openURL(e.nativeEvent.targetUrl)
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
            <AddressBarOverlay />
            <SelectPublicChatsOverlay
                onReject={overlayProps.onReject}
                onAccept={overlayProps.onAccept}
                open={isSelectingPublicChats}
                onOpenChange={setIsSelectingPublicChats}
            />

            <RequestPermissionOverlay
                requestedPermission={requestedPermission}
                handlePermissionResponse={handlePermissionResponse}
                onAccept={overlayProps.onAccept}
                onReject={overlayProps.onReject}
            />
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
