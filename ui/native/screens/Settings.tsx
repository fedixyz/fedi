import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Alert,
    Linking,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native'
import Share from 'react-native-share'

import { useFederationSupportsSingleSeed } from '@fedi/common/hooks/federation'
import { useToast } from '@fedi/common/hooks/toast'
import { useExportTransactions } from '@fedi/common/hooks/transactions'
import {
    changeAuthenticatedGuardian,
    leaveFederation,
    resetFederationChatState,
    selectActiveFederation,
    selectAuthenticatedMember,
    selectCurrency,
    selectDeveloperMode,
    selectStableBalance,
    selectStableBalancePending,
    setDeveloperMode,
} from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'
import {
    getFederationTosUrl,
    shouldShowInviteCode,
} from '@fedi/common/utils/FederationUtils'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../bridge'
import SettingsItem from '../components/feature/admin/SettingsItem'
import Avatar, { AvatarSize } from '../components/ui/Avatar'
import SvgImage from '../components/ui/SvgImage'
import { version } from '../package.json'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('Settings')

export type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>

const Settings: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const toast = useToast()
    const exportTransactions = useExportTransactions(fedimint)
    const [unlockDevModeCount, setUnlockDevModeCount] = useState<number>(0)
    const [isExportingCSV, setIsExportingCSV] = useState(false)

    const dispatch = useAppDispatch()
    const activeFederation = useAppSelector(selectActiveFederation)
    const authenticatedMember = useAppSelector(selectAuthenticatedMember)
    const authenticatedGuardian = useAppSelector(
        s => s.federation.authenticatedGuardian,
    )
    const developerMode = useAppSelector(selectDeveloperMode)
    const stableBalance = useAppSelector(selectStableBalance)
    const pendingStableBalance = useAppSelector(selectStableBalancePending)
    const currency = useAppSelector(selectCurrency)
    const supportsSingleSeed = useFederationSupportsSingleSeed()

    const federationId = activeFederation?.id

    const resetChatState = useCallback(() => {
        if (federationId) {
            dispatch(
                resetFederationChatState({
                    federationId,
                }),
            )
        }
    }, [federationId, dispatch])

    const resetGuardiansState = useCallback(() => {
        dispatch(changeAuthenticatedGuardian(null))
    }, [dispatch])

    // FIXME: this needs some kind of loading state
    // TODO: this should be an thunkified action creator
    const handleLeaveFederation = useCallback(async () => {
        try {
            if (federationId) {
                // FIXME: currently this specific order of operations fixes a
                // bug where the username would get stuck in storage and when
                // rejoining the federation, the user cannot create an new
                // username with the fresh seed and the stored username fails
                // to authenticate so chat ends up totally broken
                // However it's not safe because if leaveFederation fails, then
                // we are resetting state too early and could corrupt things
                // Need to investigate further why running leaveFederation first
                // causes this bug
                resetChatState()
                resetGuardiansState()
                await dispatch(
                    leaveFederation({
                        fedimint,
                        federationId,
                    }),
                ).unwrap()
                navigation.replace('Initializing')
            }
        } catch (e) {
            toast.show({
                content: t('errors.failed-to-leave-federation'),
                status: 'error',
            })
            return
        }
    }, [
        navigation,
        federationId,
        dispatch,
        resetChatState,
        resetGuardiansState,
        toast,
        t,
    ])

    const confirmLeaveFederation = () => {
        // Don't allow leaving if stable balance exists
        if (stableBalance > 0) {
            Alert.alert(
                t('feature.federations.leave-federation'),
                t(
                    'feature.federations.leave-federation-withdraw-stable-first',
                    { currency },
                ),
                [
                    {
                        text: t('words.okay'),
                    },
                ],
            )
        }
        // Don't allow leaving if stable pending balance exists
        else if (pendingStableBalance > 0) {
            Alert.alert(
                t('feature.federations.leave-federation'),
                t(
                    'feature.federations.leave-federation-withdraw-pending-stable-first',
                    { currency },
                ),
                [
                    {
                        text: t('words.okay'),
                    },
                ],
            )
        }
        // Don't allow leaving sats balance is greater than 100
        else if (
            activeFederation &&
            amountUtils.msatToSat(activeFederation.balance) > 100
        ) {
            Alert.alert(
                t('feature.federations.leave-federation'),
                t('feature.federations.leave-federation-withdraw-first'),
                [
                    {
                        text: t('words.okay'),
                    },
                ],
            )
        } else {
            Alert.alert(
                t('feature.federations.leave-federation'),
                t('feature.federations.leave-federation-confirmation'),
                [
                    {
                        text: t('words.no'),
                    },
                    {
                        text: t('words.yes'),
                        onPress: handleLeaveFederation,
                    },
                ],
            )
        }
    }

    const exportTransactionsAsCsv = async () => {
        setIsExportingCSV(true)

        const res = await exportTransactions()

        if (res.success) {
            try {
                await Share.open({
                    filename:
                        Platform.OS === 'android'
                            ? res.fileName.slice(0, -4)
                            : res.fileName,
                    type: 'text/csv',
                    url: res.uri,
                })
            } catch {
                /* no-op */
            }
        } else {
            log.error('error', res.message)
            toast.show({
                content: t('errors.failed-to-fetch-transactions'),
                status: 'error',
            })
        }

        setIsExportingCSV(false)
    }

    const showInviteCode =
        activeFederation && shouldShowInviteCode(activeFederation.meta)

    const tosUrl =
        activeFederation && getFederationTosUrl(activeFederation.meta)

    return (
        <ScrollView contentContainerStyle={styles(theme).container}>
            {authenticatedMember && (
                <View style={styles(theme).profileHeader}>
                    <View style={styles(theme).avatarContainer}>
                        <Avatar
                            id={authenticatedMember?.id || ''}
                            size={AvatarSize.lg}
                            name={authenticatedMember?.username || ''}
                        />
                    </View>
                    <Text h2 medium numberOfLines={1} adjustsFontSizeToFit>
                        {authenticatedMember?.username || 'satoshi'}
                    </Text>
                </View>
            )}
            <View style={styles(theme).sectionContainer}>
                <Text style={styles(theme).sectionTitle}>
                    {t('words.federation')}
                </Text>
                {tosUrl && (
                    <SettingsItem
                        image={<SvgImage name="Scroll" />}
                        label={t('feature.federations.federation-terms')}
                        actionIcon="ExternalLink"
                        onPress={() => Linking.openURL(tosUrl)}
                    />
                )}
                {showInviteCode && (
                    <SettingsItem
                        image={<SvgImage name="Qr" />}
                        label={t('feature.federations.invite-members')}
                        onPress={() => {
                            navigation.navigate('FederationInvite', {
                                inviteLink: activeFederation.inviteCode,
                            })
                        }}
                    />
                )}
                {authenticatedGuardian !== null && (
                    <SettingsItem
                        image={<SvgImage name="SocialPeople" />}
                        label={t('feature.recovery.recovery-assist')}
                        onPress={() => {
                            navigation.navigate('StartRecoveryAssist')
                        }}
                    />
                )}
                <SettingsItem
                    image={<SvgImage name="LeaveFederation" />}
                    label={t('feature.federations.leave-federation')}
                    onPress={confirmLeaveFederation}
                />
            </View>
            {supportsSingleSeed && (
                <View>
                    <Text style={styles(theme).sectionTitle}>
                        {t('words.wallet')}
                    </Text>
                    <SettingsItem
                        image={<SvgImage name="Wallet" />}
                        label={t('feature.backup.backup-wallet')}
                        onPress={() =>
                            navigation.navigate('ChooseBackupMethod')
                        }
                    />
                    <SettingsItem
                        image={<SvgImage name="TableExport" />}
                        label={t('feature.backup.export-transactions-to-csv')}
                        onPress={exportTransactionsAsCsv}
                        disabled={isExportingCSV}
                    />
                </View>
            )}
            <View>
                <Text style={styles(theme).sectionTitle}>
                    {t('words.general')}
                </Text>
                {developerMode && (
                    <SettingsItem
                        image={<SvgImage name="FediLogoIcon" />}
                        label={'Developer Settings'}
                        onPress={() => navigation.navigate('DeveloperSettings')}
                    />
                )}
                <SettingsItem
                    image={<SvgImage name="Apps" />}
                    label={t('feature.fedimods.fedi-mods')}
                    onPress={() => navigation.navigate('FediModSettings')}
                />
                <SettingsItem
                    image={<SvgImage name="Language" />}
                    label={t('words.language')}
                    onPress={() => navigation.navigate('LanguageSettings')}
                />
                <SettingsItem
                    image={<SvgImage name="Usd" />}
                    label={t('phrases.display-currency')}
                    onPress={() => navigation.navigate('CurrencySettings')}
                />
                <SettingsItem
                    image={<SvgImage name="Bug" />}
                    label={t('feature.bug.report-a-bug')}
                    onPress={() => navigation.navigate('BugReport')}
                />
            </View>
            <View style={styles(theme).versionContainer}>
                <SvgImage
                    name="FediLogoIcon"
                    containerStyle={styles(theme).logo}
                />
                <Pressable
                    onPress={() => {
                        setUnlockDevModeCount(unlockDevModeCount + 1)
                        if (unlockDevModeCount > 21) {
                            if (developerMode) {
                                toast.show(
                                    t(
                                        'feature.developer.developer-mode-deactivated',
                                    ),
                                )
                                dispatch(setDeveloperMode(false))
                            } else {
                                toast.show(
                                    t(
                                        'feature.developer.developer-mode-activated',
                                    ),
                                )
                                dispatch(setDeveloperMode(true))
                            }
                        }
                    }}>
                    <Text>{t('phrases.app-version', { version })}</Text>
                </Pressable>
            </View>
        </ScrollView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            justifyContent: 'space-evenly',
            padding: theme.spacing.lg,
            paddingTop: 0,
        },
        profileHeader: {
            alignItems: 'center',
            padding: theme.spacing.lg,
            borderRadius: theme.borders.defaultRadius,
            borderColor: theme.colors.primaryLight,
        },
        actionsContainer: {
            flexDirection: 'row',
            justifyContent: 'flex-start',
            alignSelf: 'flex-start',
        },
        avatarContainer: {
            marginTop: theme.spacing.sm,
            marginBottom: theme.spacing.md,
        },
        sectionContainer: {
            flexDirection: 'column',
            alignItems: 'flex-start',
        },
        sectionTitle: {
            color: theme.colors.primaryLight,
            paddingVertical: theme.spacing.sm,
        },
        versionContainer: {
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.offWhite,
            padding: theme.spacing.md,
            borderRadius: theme.borders.defaultRadius,
            marginTop: theme.spacing.md,
        },
        logo: {
            marginBottom: theme.spacing.sm,
        },
    })

export default Settings
