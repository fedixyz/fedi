import { useDebouncePress } from '@fedi/common/hooks/util'
import { setActiveFederationId } from '@fedi/common/redux/federation'
import { LoadedFederation } from '@fedi/common/types'
import {
    getFederationTosUrl,
    shouldShowInviteCode,
    supportsSingleSeed,
} from '@fedi/common/utils/FederationUtils'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { ListItem, Text, Theme, useTheme } from '@rneui/themed'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, StyleSheet, View } from 'react-native'
import { useAppDispatch } from '../../../state/hooks'
import { RootStackParamList } from '../../../types/navigation'
import { useNativeExport } from '../../../utils/hooks/export'
import { useNativeLeaveFederation } from '../../../utils/hooks/leaveFederation'
import SvgImage from '../../ui/SvgImage'
import { FederationLogo } from '../federations/FederationLogo'
import { BetaBadge } from './BetaBadge'
import SettingsItem from './SettingsItem'

type CommunityMenuProps = {
    community: LoadedFederation
}

export const CommunitySettings = ({ community }: CommunityMenuProps) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const style = styles(theme)
    const dispatch = useAppDispatch()
    const navigation =
        useNavigation<
            NativeStackNavigationProp<RootStackParamList, 'Settings'>
        >()

    const { exportTransactionsAsCsv, exportingFederationId } = useNativeExport()
    const { confirmLeaveFederation } = useNativeLeaveFederation(navigation)

    const [isExpanded, setIsExpanded] = useState(false)

    const tosUrl = getFederationTosUrl(community.meta)
    const runSocialBackup = () => {
        dispatch(setActiveFederationId(community.id))
        navigation.navigate('StartSocialBackup')
    }

    // Don't allow double-taps
    const handlePress = useDebouncePress(() => setIsExpanded(!isExpanded), 300)

    return (
        <View style={style.sectionContainer}>
            <ListItem.Accordion
                containerStyle={style.accordionContainer}
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
                        <FederationLogo federation={community} size={24} />
                        <Text medium style={style.sectionTitle}>
                            {community.name}
                        </Text>
                    </ListItem.Content>
                }
                onPress={() => handlePress()}
                isExpanded={isExpanded}>
                <View key={community.id} style={style.container}>
                    <SettingsItem
                        icon="Federation"
                        label={t('feature.federations.federation-details')}
                        onPress={() => {
                            navigation.navigate('FederationDetails', {
                                federationId: community.id,
                            })
                        }}
                    />
                    <SettingsItem
                        icon="Apps"
                        label={t('feature.federations.federation-mods')}
                        onPress={() => {
                            navigation.navigate('FederationModSettings', {
                                type: 'community',
                            })
                        }}
                    />
                    {shouldShowInviteCode(community.meta) && (
                        <SettingsItem
                            icon="Qr"
                            label={t('feature.federations.invite-members')}
                            onPress={() => {
                                navigation.navigate('FederationInvite', {
                                    inviteLink: community.inviteCode,
                                })
                            }}
                        />
                    )}
                    {supportsSingleSeed(community) && (
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
                    {community.hasWallet && (
                        <SettingsItem
                            icon="TableExport"
                            label={t(
                                'feature.backup.export-transactions-to-csv',
                            )}
                            onPress={() => exportTransactionsAsCsv(community)}
                            disabled={!!exportingFederationId}
                        />
                    )}
                    <SettingsItem
                        icon="LeaveFederation"
                        label={t('feature.federations.leave-federation')}
                        onPress={() => confirmLeaveFederation(community)}
                    />
                </View>
            </ListItem.Accordion>
        </View>
    )
}

const styles = (theme: Theme) =>
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
