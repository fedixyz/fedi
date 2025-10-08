import Clipboard from '@react-native-clipboard/clipboard'
import messaging from '@react-native-firebase/messaging'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Input, Switch, Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ActivityIndicator,
    Platform,
    ScrollView,
    StyleSheet,
    View,
    Linking,
    Modal,
} from 'react-native'

import { useIsStabilityPoolSupported } from '@fedi/common/hooks/federation'
import { useToast } from '@fedi/common/hooks/toast'
import {
    changeAuthenticatedGuardian,
    clearAutojoinedCommunitiesAndNotices,
    listGateways,
    refreshStabilityPool,
    resetNuxSteps,
    selectFediModShowClearCacheButton,
    selectFediModCacheEnabled,
    selectFediModCacheMode,
    selectFediModDebugMode,
    selectOnchainDepositsEnabled,
    selectShowFiatTxnAmounts,
    selectStabilityPoolCycleStartPrice,
    selectStableBalanceEnabled,
    setFediModShowClearCacheButton,
    setFediModCacheEnabled,
    setFediModCacheMode,
    setFediModDebugMode,
    setOnchainDepositsEnabled,
    setShowFiatTxnAmounts,
    setStableBalanceEnabled,
    selectPaymentFederation,
    clearSessionCount,
} from '@fedi/common/redux'
import { clearAnalyticsState } from '@fedi/common/redux/analytics'
import { selectCurrency } from '@fedi/common/redux/currency'
import {
    FediModCacheMode,
    Guardian,
    LightningGateway,
    SupportedCurrency,
} from '@fedi/common/types'
import { GuardianStatus } from '@fedi/common/types/bindings'
import {
    getGuardianStatuses,
    switchGateway,
} from '@fedi/common/utils/FederationUtils'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../bridge'
import FederationWalletSelector from '../components/feature/send/FederationWalletSelector'
import CheckBox from '../components/ui/CheckBox'
import Flex from '../components/ui/Flex'
import SvgImage from '../components/ui/SvgImage'
import { version } from '../package.json'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { RootStackParamList } from '../types/navigation'
import { useShareNativeLogs } from '../utils/hooks/export'
import { shareReduxState } from '../utils/log'

const log = makeLog('DeveloperSettings')

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'DeveloperSettings'
>
type FeesMap = { [key: string]: number }

const DeveloperSettings: React.FC<Props> = ({ navigation }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const toast = useToast()
    const [fcmToken, setFcmToken] = useState<string | null>(null)
    const [isModalVisible, setIsModalVisible] = useState(false)
    const [isLoadingGateways, setIsLoadingGateways] = useState<boolean>(false)
    const [gateways, setGateways] = useState<LightningGateway[]>([])
    const [outstandingFediSendFeesMap, setOutstandingFediSendFeesMap] =
        useState<FeesMap>({})
    const [outstandingFediReceiveFeesMap, setOutstandingFediReceiveFeesMap] =
        useState<FeesMap>({})
    const [pendingFediSendFeesMap, setPendingFediSendFeesMap] =
        useState<FeesMap>({})
    const [pendingFediReceiveFeesMap, setPendingFediReceiveFeesMap] =
        useState<FeesMap>({})
    const [isSharingState, setIsSharingState] = useState(false)
    const [isSensitiveLogging, setIsSensitiveLogging] = useState<boolean>(false)
    const [guardianOnlineStatus, setGuardianOnlineStatus] = useState<
        GuardianStatus[]
    >([])
    const paymentFederation = useAppSelector(selectPaymentFederation)
    const selectedFiatCurrency = useAppSelector(s =>
        selectCurrency(s, paymentFederation?.id),
    )
    const fediModDebugMode = useAppSelector(selectFediModDebugMode)
    const fediModCacheEnabled = useAppSelector(selectFediModCacheEnabled)
    const showClearCacheButton = useAppSelector(
        selectFediModShowClearCacheButton,
    )
    const fediModCacheMode = useAppSelector(selectFediModCacheMode)
    const onchainDepositsEnabled = useAppSelector(selectOnchainDepositsEnabled)
    const stabilityPoolSupported = useIsStabilityPoolSupported(
        paymentFederation?.id || '',
    )
    const stableBalanceEnabled = useAppSelector(selectStableBalanceEnabled)
    const showFiatTxnAmounts = useAppSelector(selectShowFiatTxnAmounts)
    const spBtcUsdPrice = useAppSelector(s =>
        selectStabilityPoolCycleStartPrice(s, paymentFederation?.id || ''),
    )
    const apiBtcUsdPrice = useAppSelector(s => s.currency.btcUsdRate)
    const apiFiatUsdPrices = useAppSelector(s => s.currency.fiatUsdRates)

    const { shareLogs, status: shareLogsStatus } = useShareNativeLogs(
        paymentFederation?.id,
    )

    // This is a partial refactor of state management from context to redux
    const reduxDispatch = useAppDispatch()
    const authenticatedGuardian = useAppSelector(
        s => s.federation.authenticatedGuardian,
    )

    useEffect(() => {
        if (paymentFederation) {
            fedimint
                .getAccruedOutstandingFediFeesPerTXType({
                    federationId: paymentFederation.id,
                })
                .then(res => {
                    const sendFeesMap: FeesMap = {}
                    const receiveFeesMap: FeesMap = {}
                    res.map(fee => {
                        if (fee[1] === 'send') sendFeesMap[fee[0]] = fee[2]
                        else if (fee[1] === 'receive')
                            receiveFeesMap[fee[0]] = fee[2]
                    }, {})
                    setOutstandingFediSendFeesMap(sendFeesMap)
                    setOutstandingFediReceiveFeesMap(receiveFeesMap)
                })
                .catch(err =>
                    log.warn(
                        'Failed to get accured outstanding fedi fees',
                        err,
                    ),
                )
        }
    }, [paymentFederation])

    useEffect(() => {
        if (paymentFederation) {
            fedimint
                .getAccruedPendingFediFeesPerTXType({
                    federationId: paymentFederation.id,
                })
                .then(res => {
                    const sendFeesMap: FeesMap = {}
                    const receiveFeesMap: FeesMap = {}
                    res.map(fee => {
                        if (fee[1] === 'send') sendFeesMap[fee[0]] = fee[2]
                        else if (fee[1] === 'receive')
                            receiveFeesMap[fee[0]] = fee[2]
                    }, {})
                    setPendingFediSendFeesMap(sendFeesMap)
                    setPendingFediReceiveFeesMap(receiveFeesMap)
                })
                .catch(err =>
                    log.warn(
                        'Failed to get pending outstanding fedi fees',
                        err,
                    ),
                )
        }
    }, [paymentFederation])

    useEffect(() => {
        fedimint
            .getSensitiveLog()
            .then(setIsSensitiveLogging)
            .catch(err =>
                log.warn('Failed to get sensitive logging status', err),
            )
    }, [])

    useEffect(() => {
        const loadGuardianStatus = async () => {
            if (!paymentFederation?.id) return
            const status = await getGuardianStatuses(
                fedimint,
                paymentFederation.id,
            )
            setGuardianOnlineStatus(status)
        }

        loadGuardianStatus()
    }, [paymentFederation])

    useEffect(() => {
        const getGatewaysList = async () => {
            setIsLoadingGateways(true)
            try {
                if (!paymentFederation?.id)
                    throw new Error('No active federation')
                const _gateways = await reduxDispatch(
                    listGateways({
                        federationId: paymentFederation?.id,
                        fedimint,
                    }),
                ).unwrap()
                setGateways(_gateways)
            } catch (e) {
                toast.show({
                    content: t('errors.failed-to-fetch-gateways'),
                    status: 'error',
                })
            }
            setIsLoadingGateways(false)
        }

        getGatewaysList()
    }, [toast, t, paymentFederation, reduxDispatch])

    useEffect(() => {
        if (stabilityPoolSupported)
            reduxDispatch(
                refreshStabilityPool({
                    fedimint,
                    federationId: paymentFederation?.id || '',
                }),
            )
    }, [paymentFederation?.id, reduxDispatch, stabilityPoolSupported])

    const handleSelectGateway = async (gateway: LightningGateway) => {
        try {
            if (!paymentFederation?.id) throw new Error('No active federation')
            await switchGateway(
                fedimint,
                paymentFederation.id,
                gateway.nodePubKey,
            )
        } catch (e) {
            toast.show({
                content: t('errors.failed-to-switch-gateways'),
                status: 'error',
            })
        }
        const updatedGateways = gateways.map((gw: LightningGateway) => {
            gw.active = gateway.nodePubKey === gw.nodePubKey
            return gw
        })
        setGateways(updatedGateways)
    }

    const handleShareStorage = async () => {
        setIsSharingState(true)
        try {
            await shareReduxState()
        } catch (e) {
            toast.error(t, e)
        }
        setIsSharingState(false)
    }

    const fetchAndShowFCMToken = async () => {
        try {
            const hasPermission = await checkNotificationPermissions()
            if (!hasPermission) {
                // Return early if permissions are not granted
                return
            }

            const token = await messaging().getToken()
            if (token) {
                setFcmToken(token)
                setIsModalVisible(true)
            } else {
                log.warn("FCM Token - Couldn't fetch token.")
                toast.show({
                    content: 'Unable to fetch FCM token.',
                    status: 'error',
                })
            }
        } catch (error) {
            log.error(`Error fetching FCM token: ${JSON.stringify(error)}`)
            toast.show({
                content: 'Error fetching FCM token.',
                status: 'error',
            })
        }
    }

    const copyToClipboard = () => {
        if (fcmToken) {
            Clipboard.setString(fcmToken)
            toast.show({
                content: 'Token copied to clipboard!',
                status: 'success',
            })
        }
    }

    const checkNotificationPermissions = async (): Promise<boolean> => {
        const authStatus = await messaging().requestPermission()
        const enabled =
            authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
            authStatus === messaging.AuthorizationStatus.PROVISIONAL

        if (!enabled) {
            log.warn('Notifications are not enabled.')
            toast.show({
                content: 'Notifications permissions are required.',
                status: 'error',
            })
            return false // Return `false` if permissions are not granted
        }

        return true // Return `true` if permissions are granted
    }

    const logFCMToken = async () => {
        try {
            // Request notification permissions
            const hasPermission = await checkNotificationPermissions()
            if (!hasPermission) {
                // Return early if permissions are not granted
                return
            }

            // Wait for APNs token to be available
            if (Platform.OS === 'ios') {
                const apnsToken = await messaging().getAPNSToken()
                if (apnsToken) {
                    log.info(`APNs Token: ${apnsToken}`)
                } else {
                    log.warn('APNs Token not available.')
                }
            }

            // Fetch FCM token
            const fbToken = await messaging().getToken()
            if (fbToken) {
                log.info(`FCM Notification Token: ${fbToken}`)
            } else {
                log.warn("FCM Token - Couldn't fetch token.")
            }
        } catch (error) {
            log.error(`Error fetching tokens: ${JSON.stringify(error)}`)
        }
    }

    const sendTokenViaEmail = () => {
        if (!fcmToken) {
            toast.show({
                content: 'FCM token is not available!',
                status: 'error',
            })
            return
        }

        const subject = 'Your FCM Token'
        const body = `Here is your FCM token:\n\n${fcmToken}`
        const emailUrl = `mailto:?subject=${encodeURIComponent(
            subject,
        )}&body=${encodeURIComponent(body)}`

        // Try opening the email client directly
        Linking.openURL(emailUrl)
            .then(() => {
                log.info('Email client opened successfully')
            })
            .catch(err => {
                log.error(`Error opening email client: ${err}`)

                // Provide a fallback message if the email client fails to open
                toast.show({
                    content:
                        'Unable to open the email client. Please ensure an email app is installed and configured.',
                    status: 'error',
                })
            })
    }

    const style = styles(theme)

    return (
        <ScrollView contentContainerStyle={style.container}>
            <SettingsSection title="App info">
                <Text style={style.version}>{`Version ${version}`}</Text>
                <Button
                    title={t('feature.developer.share-state')}
                    containerStyle={style.buttonContainer}
                    onPress={handleShareStorage}
                    loading={isSharingState}
                />
                <Button
                    title={t('feature.developer.log-fcm-token')}
                    containerStyle={style.buttonContainer}
                    onPress={logFCMToken}
                />
                <Button
                    title={t('feature.developer.show-fcm-token')}
                    containerStyle={style.buttonContainer}
                    onPress={fetchAndShowFCMToken}
                />
                <View style={style.switchWrapper}>
                    <View style={style.switchLabelContainer}>
                        <Text caption style={style.switchLabel}>
                            Enable sensitive logging
                        </Text>
                        <Text small style={style.switchLabel}>
                            This will allow logs to include additional
                            information that could leak private or secure
                            details. Use with caution.
                        </Text>
                    </View>
                    <Switch
                        value={isSensitiveLogging}
                        onValueChange={value => {
                            fedimint.setSensitiveLog(value)
                            setIsSensitiveLogging(value)
                        }}
                    />
                </View>
            </SettingsSection>
            <SettingsSection title={t('feature.fedimods.debug-mode')}>
                <View style={style.switchWrapper}>
                    <View style={style.switchLabelContainer}>
                        <Text small style={style.switchLabel}>
                            {t('feature.fedimods.debug-mode-info')}
                        </Text>
                    </View>
                    <Switch
                        value={fediModDebugMode}
                        onValueChange={value => {
                            reduxDispatch(setFediModDebugMode(value))
                        }}
                    />
                </View>
            </SettingsSection>
            <SettingsSection title={t('feature.fedimods.cache-clear')}>
                <View style={styles(theme).switchWrapper}>
                    <View style={styles(theme).switchLabelContainer}>
                        <Text small style={styles(theme).switchLabel}>
                            {t('feature.fedimods.cache-clear-info')}
                        </Text>
                    </View>
                    <Switch
                        value={showClearCacheButton}
                        onValueChange={value => {
                            reduxDispatch(setFediModShowClearCacheButton(value))
                        }}
                    />
                </View>
            </SettingsSection>
            <SettingsSection title={t('feature.fedimods.cache-enabled')}>
                <View style={styles(theme).switchWrapper}>
                    <View style={styles(theme).switchLabelContainer}>
                        <Text small style={styles(theme).switchLabel}>
                            {t('feature.fedimods.cache-enabled-info')}
                        </Text>
                    </View>
                    <Switch
                        value={fediModCacheEnabled}
                        onValueChange={value => {
                            reduxDispatch(setFediModCacheEnabled(value))
                        }}
                    />
                </View>
            </SettingsSection>
            <SettingsSection title={t('feature.fedimods.cache-mode')}>
                <View style={styles(theme).switchLabelContainer}>
                    <Text small style={styles(theme).switchLabel}>
                        {t('feature.fedimods.cache-mode-info')}
                    </Text>
                </View>
                {[
                    'LOAD_DEFAULT' as const,
                    'LOAD_CACHE_ONLY' as const,
                    'LOAD_CACHE_ELSE_NETWORK' as const,
                    'LOAD_NO_CACHE' as const,
                ].map((mode: FediModCacheMode, index: number) => (
                    <View key={mode}>
                        <CheckBox
                            key={index}
                            checkedIcon={<SvgImage name="RadioSelected" />}
                            uncheckedIcon={<SvgImage name="RadioUnselected" />}
                            title={
                                <Text
                                    style={styles(theme).checkboxText}
                                    numberOfLines={1}>
                                    {mode}
                                </Text>
                            }
                            checked={mode === fediModCacheMode}
                            onPress={() =>
                                reduxDispatch(setFediModCacheMode(mode))
                            }
                            containerStyle={styles(theme).checkboxContainer}
                        />
                    </View>
                ))}
            </SettingsSection>
            <SettingsSection title="Exchange rates">
                <View style={style.exchangeRate}>
                    <Text caption medium>
                        USD/BTC (Stability pool):
                    </Text>
                    <Text caption>{spBtcUsdPrice || 'N/A'}</Text>
                </View>
                <View style={style.exchangeRate}>
                    <Text caption medium>
                        USD/BTC (API):
                    </Text>
                    <Text caption>{apiBtcUsdPrice}</Text>
                </View>
                {selectedFiatCurrency !== SupportedCurrency.USD && (
                    <View style={style.exchangeRate}>
                        <Text caption medium>
                            {selectedFiatCurrency}/USD (API):{' '}
                        </Text>
                        <Text caption>
                            {apiFiatUsdPrices[selectedFiatCurrency] || 'N/A'}
                        </Text>
                    </View>
                )}
            </SettingsSection>
            <SettingsSection title={t('words.wallet')}>
                <View style={style.switchWrapper}>
                    <View style={style.switchLabelContainer}>
                        <Text caption style={style.switchLabel}>
                            {t('feature.receive.enable-onchain-deposits')}
                        </Text>
                    </View>
                    <Switch
                        value={onchainDepositsEnabled}
                        onValueChange={value => {
                            reduxDispatch(setOnchainDepositsEnabled(value))
                        }}
                    />
                </View>
                <View style={style.switchWrapper}>
                    <View style={style.switchLabelContainer}>
                        <Text caption style={style.switchLabel}>
                            {t('feature.wallet.show-fiat-txn-amounts')}
                        </Text>
                        <Text small style={style.switchLabel}>
                            {t('feature.wallet.show-fiat-txn-amounts-info')}
                        </Text>
                    </View>
                    <Switch
                        value={showFiatTxnAmounts}
                        onValueChange={value => {
                            reduxDispatch(setShowFiatTxnAmounts(value))
                        }}
                    />
                </View>
            </SettingsSection>

            <SettingsSection title="Chat">
                <Button
                    title={t('feature.developer.create-default-group')}
                    containerStyle={style.buttonContainer}
                    onPress={() => {
                        navigation.navigate('CreateGroup', {
                            defaultGroup: true,
                        })
                    }}
                />
                <Text small style={style.switchLabel}>
                    {t('feature.developer.default-groups-info')}
                </Text>
            </SettingsSection>

            <SettingsSection title="Danger zone">
                <Button
                    title="Reset new user experience"
                    containerStyle={style.buttonContainer}
                    onPress={() => {
                        reduxDispatch(resetNuxSteps())
                        toast.show('NUX reset!')
                    }}
                />
                <Button
                    title="Reset all auto-join community logic"
                    containerStyle={style.buttonContainer}
                    onPress={() => {
                        reduxDispatch(clearAutojoinedCommunitiesAndNotices())
                        toast.show({
                            content:
                                'Cleared previously auto-joined communities & notices to display!',
                            status: 'success',
                        })
                    }}
                />
                <Button
                    title="Reset opt-in sharing state"
                    containerStyle={style.buttonContainer}
                    onPress={() => {
                        reduxDispatch(clearAnalyticsState())
                        reduxDispatch(clearSessionCount())
                        toast.show({
                            content: 'Cleared analytics opt-in sharing state',
                            status: 'success',
                        })
                    }}
                />
                <Button
                    title="Mark Bridge for Export"
                    containerStyle={style.buttonContainer}
                    onPress={async () => {
                        await fedimint.internalMarkBridgeExport()
                        toast.show({
                            content:
                                'Bridge marked for export, Please restart the app',
                            status: 'success',
                        })
                    }}
                />
            </SettingsSection>

            <SettingsSection title="Federation-specific settings">
                <Text caption style={style.switchLabel}>
                    {`The settings below can change based on the selected federation`}
                </Text>
                <FederationWalletSelector fullWidth />
                <SettingsSection title="Change your lightning gateway">
                    {isLoadingGateways && <ActivityIndicator />}
                    {gateways.map((gw: LightningGateway, index: number) => (
                        <View key={gw.nodePubKey}>
                            <CheckBox
                                key={index}
                                checkedIcon={<SvgImage name="RadioSelected" />}
                                uncheckedIcon={
                                    <SvgImage name="RadioUnselected" />
                                }
                                title={
                                    <Text
                                        style={style.checkboxText}
                                        numberOfLines={1}>
                                        {gw.api}
                                    </Text>
                                }
                                checked={gw.active}
                                onPress={() => handleSelectGateway(gw)}
                                containerStyle={style.checkboxContainer}
                            />
                        </View>
                    ))}
                </SettingsSection>
                {/* TODO: Clean up this mess */}
                {Object.keys(outstandingFediSendFeesMap).length !== 0 ? (
                    Object.entries(outstandingFediSendFeesMap).map(
                        ([module, fee]) => (
                            <View key={`outstanding-send-fees-${module}`}>
                                <Text
                                    style={
                                        style.version
                                    }>{`Outstanding Send Fees for ${module}: ${fee}`}</Text>
                            </View>
                        ),
                    )
                ) : (
                    <Text>No outstanding send fees</Text>
                )}
                {Object.keys(outstandingFediReceiveFeesMap).length !== 0 ? (
                    Object.entries(outstandingFediReceiveFeesMap).map(
                        ([module, fee]) => (
                            <View key={`outstanding-receive-fees-${module}`}>
                                <Text
                                    style={
                                        style.version
                                    }>{`Outstanding Receive Fees for ${module}: ${fee}`}</Text>
                            </View>
                        ),
                    )
                ) : (
                    <Text>No outstanding receive fees</Text>
                )}
                {Object.keys(pendingFediSendFeesMap).length !== 0 ? (
                    Object.entries(pendingFediSendFeesMap).map(
                        ([module, fee]) => (
                            <View key={`pending-send-fees-${module}`}>
                                <Text
                                    style={
                                        style.version
                                    }>{`Pending Send Fees for ${module}: ${fee}`}</Text>
                            </View>
                        ),
                    )
                ) : (
                    <Text>No pending send fees</Text>
                )}
                {Object.keys(pendingFediReceiveFeesMap).length !== 0 ? (
                    Object.entries(pendingFediReceiveFeesMap).map(
                        ([module, fee]) => (
                            <View key={`pending-receive-fees-${module}`}>
                                <Text
                                    style={
                                        style.version
                                    }>{`Pending Receive Fees for ${module}: ${fee}`}</Text>
                            </View>
                        ),
                    )
                ) : (
                    <Text>No pending receive fees</Text>
                )}
                {stabilityPoolSupported && (
                    <View style={style.switchWrapper}>
                        <View style={style.switchLabelContainer}>
                            <Text caption style={style.switchLabel}>
                                {t('feature.fedimods.stable-balance-enabled')}
                            </Text>
                            <Text small style={style.switchLabel}>
                                {t(
                                    'feature.fedimods.stable-balance-enabled-info',
                                )}
                            </Text>
                        </View>
                        <Switch
                            value={stableBalanceEnabled}
                            onValueChange={value => {
                                reduxDispatch(setStableBalanceEnabled(value))
                            }}
                        />
                    </View>
                )}
                <SettingsSection title="Select a node to simulate Guardian Mode">
                    <CheckBox
                        checkedIcon={<SvgImage name="RadioSelected" />}
                        uncheckedIcon={<SvgImage name="RadioUnselected" />}
                        title={
                            <Text
                                caption
                                style={{
                                    color:
                                        authenticatedGuardian == null
                                            ? theme.colors.primary
                                            : theme.colors.red,
                                }}>
                                {authenticatedGuardian == null
                                    ? 'None'
                                    : 'Reset'}
                            </Text>
                        }
                        checked={!authenticatedGuardian}
                        onPress={() => {
                            reduxDispatch(changeAuthenticatedGuardian(null))
                        }}
                        containerStyle={style.checkboxContainer}
                    />
                    {paymentFederation &&
                        paymentFederation.nodes &&
                        Object.entries(paymentFederation.nodes).map(entry => {
                            const [index, node] = entry
                            const id = Number(index)
                            const guardian: Guardian = {
                                ...node,
                                peerId: id,
                                password: `${id + 1}${id + 1}${id + 1}${id + 1}`,
                            }
                            return (
                                <CheckBox
                                    key={id}
                                    checkedIcon={
                                        <SvgImage name="RadioSelected" />
                                    }
                                    uncheckedIcon={
                                        <SvgImage name="RadioUnselected" />
                                    }
                                    title={<Text caption>{guardian.name}</Text>}
                                    checked={
                                        authenticatedGuardian?.name ===
                                        guardian.name
                                    }
                                    onPress={() => {
                                        reduxDispatch(
                                            changeAuthenticatedGuardian(
                                                guardian,
                                            ),
                                        )
                                    }}
                                    containerStyle={style.checkboxContainer}
                                />
                            )
                        })}
                    {authenticatedGuardian && (
                        <Flex fullWidth>
                            <Text small>{'Confirm guardian password'}</Text>
                            <Input
                                onChangeText={input => {
                                    reduxDispatch(
                                        changeAuthenticatedGuardian({
                                            ...authenticatedGuardian,
                                            password: input,
                                        }),
                                    )
                                }}
                                value={authenticatedGuardian.password}
                                returnKeyType="done"
                                autoCapitalize={'none'}
                                autoCorrect={false}
                            />
                        </Flex>
                    )}

                    <SettingsSection title="Guardian Status">
                        {guardianOnlineStatus.map((n, index) => {
                            let statusText
                            let statusStyle

                            if ('online' in n) {
                                statusText = `Guardian ${n.online.guardian}: Online: ${n.online.latency_ms}ms`
                                statusStyle = style.onlineStatus
                            }
                            if ('error' in n) {
                                statusText = `Guardian  ${n.error.guardian} Error: ${n.error.error}`
                                statusStyle = style.errorStatus
                            }
                            if ('timeout' in n) {
                                statusText = `Guardian  ${n.timeout.guardian} Timeout: ${n.timeout.elapsed}`
                                statusStyle = style.timeoutStatus
                            }

                            return (
                                <Text key={index} style={statusStyle}>
                                    {statusText}
                                </Text>
                            )
                        })}
                    </SettingsSection>

                    <SettingsSection title="Danger zone">
                        <Button
                            title={t('feature.developer.share-logs')}
                            containerStyle={style.buttonContainer}
                            onPress={shareLogs}
                            loading={shareLogsStatus === 'generating-data'}
                        />
                        <Button
                            title="Evil Spam Invoices"
                            containerStyle={style.buttonContainer}
                            onPress={async () => {
                                if (!paymentFederation?.id) return
                                await fedimint.evilSpamInvoices({
                                    federationId: paymentFederation.id,
                                })
                            }}
                        />
                        <Button
                            title="Evil Spam Address"
                            containerStyle={style.buttonContainer}
                            onPress={async () => {
                                if (!paymentFederation?.id) return
                                await fedimint.evilSpamAddress({
                                    federationId: paymentFederation.id,
                                })
                            }}
                        />
                    </SettingsSection>
                </SettingsSection>
            </SettingsSection>
            <Modal
                visible={isModalVisible}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setIsModalVisible(false)}>
                <View style={style.modalContainer}>
                    <View style={style.modalContent}>
                        <Text style={style.modalTitle}>FCM Token</Text>
                        <Text selectable style={style.tokenText}>
                            {fcmToken}
                        </Text>
                        <Button
                            title="Copy to Clipboard"
                            onPress={copyToClipboard}
                            containerStyle={style.buttonContainer}
                        />
                        <Button
                            title="Send via Email"
                            onPress={sendTokenViaEmail}
                            containerStyle={style.buttonContainer}
                        />
                        <Button
                            title="Close"
                            onPress={() => setIsModalVisible(false)}
                            containerStyle={style.buttonContainer}
                        />
                    </View>
                </View>
            </Modal>
        </ScrollView>
    )
}

const SettingsSection: React.FC<{
    title: React.ReactNode
    children: React.ReactNode
}> = ({ title, children }) => {
    const { theme } = useTheme()

    const style = styles(theme)

    return (
        <View style={style.section}>
            <Text bold style={style.sectionTitle}>
                {title}
            </Text>
            <View>{children}</View>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        modalContent: {
            backgroundColor: 'white',
            borderRadius: 10,
            padding: 20,
            width: '80%',
            alignItems: 'center',
        },
        modalTitle: {
            fontSize: 18,
            fontWeight: 'bold',
            marginBottom: 10,
        },
        tokenText: {
            marginVertical: 20,
            fontSize: 16,
            textAlign: 'center',
        },
        modalContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
        },
        container: {
            padding: theme.spacing.xl,
        },
        section: {
            paddingBottom: theme.spacing.lg,
        },
        sectionTitle: {
            marginVertical: theme.spacing.md,
        },
        checkboxContainer: {
            margin: 0,
            paddingHorizontal: 0,
        },
        checkboxText: {
            paddingHorizontal: theme.spacing.md,
            textAlign: 'left',
        },
        buttonContainer: {
            marginBottom: theme.spacing.md,
        },
        version: {
            marginBottom: theme.spacing.sm,
        },
        switchWrapper: {
            width: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: theme.spacing.md,
        },
        switchLabelContainer: {
            maxWidth: '70%',
        },
        switchLabel: {
            textAlign: 'left',
            marginBottom: theme.spacing.xs,
        },
        onlineStatus: {
            color: 'green',
        },
        errorStatus: {
            color: 'red',
        },
        timeoutStatus: {
            color: 'orange',
        },
        exchangeRate: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            marginBottom: theme.spacing.xs,
        },
    })

export default DeveloperSettings
