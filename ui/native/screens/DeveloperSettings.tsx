import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Input, Switch, Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native'

import { useIsStabilityPoolSupported } from '@fedi/common/hooks/federation'
import { useToast } from '@fedi/common/hooks/toast'
import {
    changeAuthenticatedGuardian,
    resetAuthenticatedMember,
    resetFederationChatState,
    selectActiveFederation,
    selectOnchainDepositsEnabled,
    setChatGroups,
    setChatMembersSeen,
    setChatMessages,
    setOnchainDepositsEnabled,
    selectStableBalanceEnabled,
    setStableBalanceEnabled,
    resetNuxSteps,
    selectShowFiatTxnAmounts,
    setShowFiatTxnAmounts,
    selectStabilityPoolCycleStartPrice,
    refreshActiveStabilityPool,
    selectFediModDebugMode,
    setFediModDebugMode,
} from '@fedi/common/redux'
import { selectCurrency } from '@fedi/common/redux/currency'
import {
    Guardian,
    LightningGateway,
    SupportedCurrency,
} from '@fedi/common/types'
import { GuardianStatus } from '@fedi/common/types/bindings'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../bridge'
import CheckBox from '../components/ui/CheckBox'
import { version } from '../package.json'
import { useAppDispatch, useAppSelector, useBridge } from '../state/hooks'
import { RootStackParamList } from '../types/navigation'
import { shareLogsExport, shareReduxState } from '../utils/logs-export'

const log = makeLog('DeveloperSettings')

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'DeveloperSettings'
>

const DeveloperSettings: React.FC<Props> = () => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const { listGateways, switchGateway, guardianStatus } = useBridge()
    const toast = useToast()
    const [isLoadingGateways, setIsLoadingGateways] = useState<boolean>(false)
    const [gateways, setGateways] = useState<LightningGateway[]>([])
    const [isSharingLogs, setIsSharingLogs] = useState(false)
    const [isSharingState, setIsSharingState] = useState(false)
    const [isSensitiveLogging, setIsSensitiveLogging] = useState<boolean>(false)
    const [guardianOnlineStatus, setGuardianOnlineStatus] = useState<
        GuardianStatus[]
    >([])
    const selectedFiatCurrency = useAppSelector(selectCurrency)
    const fediModDebugMode = useAppSelector(selectFediModDebugMode)
    const onchainDepositsEnabled = useAppSelector(selectOnchainDepositsEnabled)
    const stabilityPoolSupported = useIsStabilityPoolSupported()
    const stableBalanceEnabled = useAppSelector(selectStableBalanceEnabled)
    const showFiatTxnAmounts = useAppSelector(selectShowFiatTxnAmounts)
    const spBtcUsdPrice = useAppSelector(selectStabilityPoolCycleStartPrice)
    const apiBtcUsdPrice = useAppSelector(s => s.currency.btcUsdRate)
    const apiFiatUsdPrices = useAppSelector(s => s.currency.fiatUsdRates)

    // This is a partial refactor of state management from context to redux
    const reduxDispatch = useAppDispatch()
    const activeFederation = useAppSelector(selectActiveFederation)
    const authenticatedGuardian = useAppSelector(
        s => s.federation.authenticatedGuardian,
    )

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
            const status = await guardianStatus()
            setGuardianOnlineStatus(status)
        }

        loadGuardianStatus()
    }, [guardianStatus])

    useEffect(() => {
        const getGatewaysList = async () => {
            setIsLoadingGateways(true)
            try {
                const _gateways = await listGateways()
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
    }, [toast, listGateways, t])

    useEffect(() => {
        if (stabilityPoolSupported)
            reduxDispatch(refreshActiveStabilityPool({ fedimint }))
    }, [reduxDispatch, stabilityPoolSupported])

    const handleSelectGateway = async (gateway: LightningGateway) => {
        try {
            await switchGateway(gateway.gatewayId)
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

    const handleShareLogs = async () => {
        setIsSharingLogs(true)
        try {
            await shareLogsExport()
        } catch (e) {
            toast.error(t, e)
        }
        setIsSharingLogs(false)
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

    return (
        <ScrollView contentContainerStyle={styles(theme).container}>
            <SettingsSection title="App info">
                <Text
                    style={styles(theme).version}>{`Version ${version}`}</Text>
                <Button
                    title={t('feature.developer.share-logs')}
                    containerStyle={styles(theme).buttonContainer}
                    onPress={handleShareLogs}
                    loading={isSharingLogs}
                />
                <Button
                    title={t('feature.developer.share-state')}
                    containerStyle={styles(theme).buttonContainer}
                    onPress={handleShareStorage}
                    loading={isSharingState}
                />
                <View style={styles(theme).switchWrapper}>
                    <View style={styles(theme).switchLabelContainer}>
                        <Text caption style={styles(theme).switchLabel}>
                            Enable sensitive logging
                        </Text>
                        <Text small style={styles(theme).switchLabel}>
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
                <View style={styles(theme).switchWrapper}>
                    <View style={styles(theme).switchLabelContainer}>
                        <Text small style={styles(theme).switchLabel}>
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
            <SettingsSection title="Exchange rates">
                <View style={styles(theme).exchangeRate}>
                    <Text caption medium>
                        USD/BTC (Stability pool):
                    </Text>
                    <Text caption>{spBtcUsdPrice || 'N/A'}</Text>
                </View>
                <View style={styles(theme).exchangeRate}>
                    <Text caption medium>
                        USD/BTC (API):
                    </Text>
                    <Text caption>{apiBtcUsdPrice}</Text>
                </View>
                {selectedFiatCurrency !== SupportedCurrency.USD && (
                    <View style={styles(theme).exchangeRate}>
                        <Text caption medium>
                            {selectedFiatCurrency}/USD (API):{' '}
                        </Text>
                        <Text caption>
                            {apiFiatUsdPrices[selectedFiatCurrency] || 'N/A'}
                        </Text>
                    </View>
                )}
            </SettingsSection>
            <SettingsSection title="Change your lightning gateway">
                {isLoadingGateways && <ActivityIndicator />}
                {gateways.map((gw: LightningGateway, index: number) => (
                    <View key={gw.nodePubKey}>
                        <CheckBox
                            key={index}
                            title={
                                <Text
                                    style={styles(theme).checkboxText}
                                    numberOfLines={1}>
                                    {gw.api}
                                </Text>
                            }
                            checked={gw.active}
                            onPress={() => handleSelectGateway(gw)}
                            containerStyle={styles(theme).checkboxContainer}
                        />
                    </View>
                ))}
            </SettingsSection>
            <SettingsSection title={t('words.wallet')}>
                <View style={styles(theme).switchWrapper}>
                    <View style={styles(theme).switchLabelContainer}>
                        <Text caption style={styles(theme).switchLabel}>
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
                {stabilityPoolSupported && (
                    <View style={styles(theme).switchWrapper}>
                        <View style={styles(theme).switchLabelContainer}>
                            <Text caption style={styles(theme).switchLabel}>
                                {t('feature.fedimods.stable-balance-enabled')}
                            </Text>
                            <Text small style={styles(theme).switchLabel}>
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
                <View style={styles(theme).switchWrapper}>
                    <View style={styles(theme).switchLabelContainer}>
                        <Text caption style={styles(theme).switchLabel}>
                            {t('feature.wallet.show-fiat-txn-amounts')}
                        </Text>
                        <Text small style={styles(theme).switchLabel}>
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
            <SettingsSection title="Select a node to simulate Guardian Mode">
                <CheckBox
                    title={
                        <Text
                            caption
                            style={{
                                color:
                                    authenticatedGuardian == null
                                        ? theme.colors.primary
                                        : theme.colors.red,
                            }}>
                            {authenticatedGuardian == null ? 'None' : 'Reset'}
                        </Text>
                    }
                    checked={!authenticatedGuardian}
                    onPress={() => {
                        reduxDispatch(changeAuthenticatedGuardian(null))
                    }}
                    containerStyle={styles(theme).checkboxContainer}
                />
                {activeFederation &&
                    Object.entries(activeFederation.nodes).map(entry => {
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
                                title={<Text caption>{guardian.name}</Text>}
                                checked={
                                    authenticatedGuardian?.name ===
                                    guardian.name
                                }
                                onPress={() => {
                                    reduxDispatch(
                                        changeAuthenticatedGuardian(guardian),
                                    )
                                }}
                                containerStyle={styles(theme).checkboxContainer}
                            />
                        )
                    })}
                {authenticatedGuardian && (
                    <View style={styles(theme).passwordContainer}>
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
                            // containerStyle={styles(theme).textInputOuter}
                            // inputContainerStyle={styles(theme).textInputInner}
                            autoCapitalize={'none'}
                            autoCorrect={false}
                        />
                    </View>
                )}
            </SettingsSection>

            <SettingsSection title="Guardian Status">
                {guardianOnlineStatus.map((n, index) => {
                    let statusText
                    let statusStyle

                    if ('online' in n) {
                        statusText = `Guardian ${n.online.guardian}: Online`
                        statusStyle = styles(theme).onlineStatus
                    }
                    if ('error' in n) {
                        statusText = `Guardian  ${n.error.guardian} Error: ${n.error.error}`
                        statusStyle = styles(theme).errorStatus
                    }
                    if ('timeout' in n) {
                        statusText = `Guardian  ${n.timeout.guardian} Timeout: ${n.timeout.elapsed}`
                        statusStyle = styles(theme).timeoutStatus
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
                    title="Reset new user experience"
                    containerStyle={styles(theme).buttonContainer}
                    onPress={() => {
                        reduxDispatch(resetNuxSteps())
                        toast.show('NUX reset!')
                    }}
                />
                <Button
                    title={'Delete all groups, messages, & members seen'}
                    containerStyle={styles(theme).buttonContainer}
                    onPress={() => {
                        if (activeFederation) {
                            reduxDispatch(
                                resetFederationChatState({
                                    federationId: activeFederation.id,
                                }),
                            )
                        }
                    }}
                />
                <Button
                    title={'Delete all groups'}
                    containerStyle={styles(theme).buttonContainer}
                    onPress={() => {
                        if (activeFederation) {
                            reduxDispatch(
                                setChatGroups({
                                    federationId: activeFederation.id,
                                    groups: [],
                                }),
                            )
                        }
                    }}
                />
                <Button
                    title={'Delete all messages'}
                    containerStyle={styles(theme).buttonContainer}
                    onPress={() => {
                        if (activeFederation) {
                            reduxDispatch(
                                setChatMessages({
                                    federationId: activeFederation.id,
                                    messages: [],
                                }),
                            )
                        }
                    }}
                />
                <Button
                    title={'Delete all members seen'}
                    containerStyle={styles(theme).buttonContainer}
                    onPress={() => {
                        if (activeFederation) {
                            reduxDispatch(
                                setChatMembersSeen({
                                    federationId: activeFederation.id,
                                    membersSeen: [],
                                }),
                            )
                        }
                    }}
                />
                <Button
                    title="Reset username"
                    containerStyle={styles(theme).buttonContainer}
                    onPress={() => {
                        if (activeFederation) {
                            reduxDispatch(
                                resetAuthenticatedMember({
                                    federationId: activeFederation.id,
                                }),
                            )
                        }
                    }}
                />
            </SettingsSection>
        </ScrollView>
    )
}

const SettingsSection: React.FC<{
    title: React.ReactNode
    children: React.ReactNode
}> = ({ title, children }) => {
    const { theme } = useTheme()
    return (
        <View style={styles(theme).section}>
            <Text bold style={styles(theme).sectionTitle}>
                {title}
            </Text>
            <View>{children}</View>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            padding: theme.spacing.xl,
        },
        section: {
            paddingBottom: theme.spacing.lg,
        },
        sectionTitle: {
            marginBottom: theme.spacing.md,
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
        guardians: {
            paddingTop: theme.spacing.lg,
            flexDirection: 'row',
            flexWrap: 'wrap',
        },
        passwordContainer: {
            flexDirection: 'column',
            width: '100%',
        },
        version: {
            marginBottom: theme.spacing.sm,
        },
        fediMod: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: theme.spacing.md,
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
