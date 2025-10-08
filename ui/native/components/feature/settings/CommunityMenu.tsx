import { useNavigation } from '@react-navigation/native'
import { ListItem, Text, useTheme } from '@rneui/themed'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Linking, View } from 'react-native'

import { useLeaveCommunity } from '@fedi/common/hooks/leave'
import { useDebouncePress } from '@fedi/common/hooks/util'
import { selectCommunityModsById } from '@fedi/common/redux/federation'
import { Community } from '@fedi/common/types'
import {
    getFederationTosUrl,
    shouldShowInviteCode,
} from '@fedi/common/utils/FederationUtils'

import { fedimint } from '../../../bridge'
import { useAppSelector } from '../../../state/hooks'
import SvgImage from '../../ui/SvgImage'
import { FederationLogo } from '../federations/FederationLogo'
import { styles } from './FederationMenu'
import SettingsItem from './SettingsItem'

type CommunityMenuProps = {
    community: Community
    testID: string
}

const CommunityMenu = ({ community }: CommunityMenuProps) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const style = styles(theme)
    const navigation = useNavigation()

    const { canLeaveCommunity, handleLeave } = useLeaveCommunity({
        t,
        fedimint,
        communityId: community.id,
    })

    const showLeaveConfirmation = () => {
        Alert.alert(
            `${t('feature.federations.leave-community')} - ${community.name}`,
            t('feature.federations.leave-community-confirmation'),
            [
                {
                    text: t('words.no'),
                },
                {
                    text: t('words.yes'),
                    onPress: handleLeave,
                },
            ],
        )
    }

    const [isExpanded, setIsExpanded] = useState(false)

    const tosUrl = getFederationTosUrl(community.meta)

    // Don't allow double-taps
    const handlePress = useDebouncePress(() => setIsExpanded(!isExpanded), 300)

    // Get the mods for the federation
    const federationMods = useAppSelector(state =>
        community.id ? selectCommunityModsById(state, community.id) : [],
    )

    const hasMods = federationMods.length > 0

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
                        icon="Community"
                        label={t('feature.communities.community-details')}
                        onPress={() => {
                            navigation.navigate('CommunityDetails', {
                                communityId: community.id,
                            })
                        }}
                    />
                    {hasMods && (
                        <SettingsItem
                            icon="Apps"
                            label={t('feature.communities.community-mods')}
                            onPress={() => {
                                navigation.navigate('FederationModSettings', {
                                    type: 'community',
                                    federationId: community.id,
                                })
                            }}
                        />
                    )}
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
                    {tosUrl && (
                        <SettingsItem
                            icon="Scroll"
                            label={t('feature.communities.community-terms')}
                            actionIcon="ExternalLink"
                            onPress={() => Linking.openURL(tosUrl)}
                        />
                    )}
                    {canLeaveCommunity && (
                        <SettingsItem
                            icon="LeaveFederation"
                            label={t('feature.communities.leave-community')}
                            onPress={() => showLeaveConfirmation()}
                        />
                    )}
                </View>
            </ListItem.Accordion>
        </View>
    )
}

export default CommunityMenu
