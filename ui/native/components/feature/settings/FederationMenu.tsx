import { useNavigation } from '@react-navigation/native'
import { ListItem, Text, Theme, useTheme } from '@rneui/themed'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Linking, StyleSheet, View } from 'react-native'

import { useLeaveFederation } from '@fedi/common/hooks/leave'
import { useDebouncePress } from '@fedi/common/hooks/util'
import { selectAuthenticatedGuardian } from '@fedi/common/redux'
import { LoadedFederation } from '@fedi/common/types'
import {
    getFederationTosUrl,
    shouldShowInviteCode,
    shouldShowSocialRecovery,
} from '@fedi/common/utils/FederationUtils'

import { useAppSelector } from '../../../state/hooks'
import { useNativeExport } from '../../../utils/hooks/export'
import SvgImage from '../../ui/SvgImage'
import { FederationLogo } from '../federations/FederationLogo'
import { BetaBadge } from './BetaBadge'
import SettingsItem from './SettingsItem'

type FederationMenuProps = {
    federation: LoadedFederation
    testID: string
}

const FederationMenu = ({ federation }: FederationMenuProps) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const style = styles(theme)
    const navigation = useNavigation()

    const { exportTransactionsAsCsv, isExporting } = useNativeExport(
        federation.id,
    )

    const authenticatedGuardian = useAppSelector(selectAuthenticatedGuardian)

    const { validateCanLeaveFederation, handleLeaveFederation } =
        useLeaveFederation({
            t,
            federationId: federation.id,
        })

    const handleLeavePressed = () => {
        if (validateCanLeaveFederation(federation)) {
            Alert.alert(
                `${t('feature.federations.leave-federation')} - ${federation.name}`,
                t('feature.federations.leave-federation-confirmation'),
                [
                    {
                        text: t('words.no'),
                    },
                    {
                        text: t('words.yes'),
                        onPress: () => handleLeaveFederation(),
                    },
                ],
            )
        }
    }

    const [isExpanded, setIsExpanded] = useState(false)

    const tosUrl = getFederationTosUrl(federation.meta)
    const runSocialBackup = () => {
        navigation.navigate('StartSocialBackup', {
            federationId: federation.id,
        })
    }

    // Don't allow double-taps
    const handlePress = useDebouncePress(() => setIsExpanded(!isExpanded), 300)

    return (
        <View style={style.sectionContainer}>
            <ListItem.Accordion
                testID={federation.name
                    .concat('FedAccordionButton')
                    .replaceAll(' ', '')}
                containerStyle={style.accordionContainer}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={federation.name.concat(' Accordion Button')}
                icon={
                    <SvgImage
                        name="ChevronRight"
                        size={theme.sizes.md}
                        dimensions={{ width: 24, height: 24 }}
                        color={theme.colors.grey}
                        svgProps={{
                            style: { transform: [{ rotate: '90deg' }] },
                        }}
                    />
                }
                pad={0}
                style={{ padding: 0, gap: 0 }}
                content={
                    <ListItem.Content style={style.accordion}>
                        <FederationLogo federation={federation} size={24} />
                        <Text medium style={style.sectionTitle}>
                            {federation.name}
                        </Text>
                    </ListItem.Content>
                }
                onPress={() => handlePress()}
                isExpanded={isExpanded}>
                <View key={federation.id} style={style.container}>
                    {authenticatedGuardian?.federationId === federation.id && (
                        <SettingsItem
                            icon="SocialPeople"
                            label={t('feature.recovery.guardian-access')}
                            onPress={() => {
                                navigation.navigate('StartRecoveryAssist')
                            }}
                        />
                    )}
                    <SettingsItem
                        icon="Federation"
                        label={t('feature.federations.federation-details')}
                        onPress={() => {
                            navigation.navigate('FederationDetails', {
                                federationId: federation.id,
                            })
                        }}
                    />
                    <SettingsItem
                        icon="Usd"
                        label={t('words.currency')}
                        onPress={() => {
                            navigation.navigate('FederationCurrency', {
                                federationId: federation.id,
                            })
                        }}
                    />
                    {shouldShowInviteCode(federation.meta) && (
                        <SettingsItem
                            icon="Qr"
                            label={t('feature.federations.invite-members')}
                            onPress={() => {
                                navigation.navigate('FederationInvite', {
                                    inviteLink: federation.inviteCode,
                                })
                            }}
                        />
                    )}
                    {shouldShowSocialRecovery(federation) && (
                        <SettingsItem
                            icon="SocialPeople"
                            label={t('feature.backup.social-backup')}
                            adornment={<BetaBadge />}
                            onPress={() => runSocialBackup()}
                        />
                    )}
                    {tosUrl && (
                        <SettingsItem
                            icon="Scroll"
                            label={t('feature.federations.federation-terms')}
                            actionIcon="ExternalLink"
                            onPress={() => Linking.openURL(tosUrl)}
                        />
                    )}
                    <SettingsItem
                        icon="TableExport"
                        label={t('feature.backup.export-transactions-to-csv')}
                        onPress={() => exportTransactionsAsCsv(federation)}
                        disabled={!!isExporting}
                    />
                    <SettingsItem
                        icon="Settings"
                        label={t('feature.settings.federation-settings')}
                        onPress={() =>
                            navigation.navigate('FederationSettings', {
                                federationId: federation.id,
                                federationName: federation.name,
                            })
                        }
                    />
                    <SettingsItem
                        icon="LeaveFederation"
                        label={t('feature.federations.leave-federation')}
                        onPress={handleLeavePressed}
                    />
                </View>
            </ListItem.Accordion>
        </View>
    )
}

// Shared with `./CommunityMenu.tsx`
export const styles = (theme: Theme) =>
    StyleSheet.create({
        sectionContainer: {
            backgroundColor: theme.colors.offWhite100,
            borderRadius: theme.borders.settingsRadius,
            paddingTop: theme.spacing.lg,
        },
        accordionContainer: {
            backgroundColor: 'transparent',
            padding: theme.spacing.lg,
            paddingTop: 0,
            gap: theme.spacing.xl,
        },
        container: {
            backgroundColor: 'transparent',
            padding: theme.spacing.xs,
        },
        sectionTitle: {
            color: theme.colors.darkGrey,
        },
        accordion: {
            flexDirection: 'row',
            justifyContent: 'flex-start',
            alignItems: 'center',
            gap: theme.spacing.sm,
        },
    })

export default FederationMenu
