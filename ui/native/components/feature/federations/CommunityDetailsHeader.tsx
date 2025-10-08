import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { selectCommunity } from '@fedi/common/redux'
import { shouldShowInviteCode } from '@fedi/common/utils/FederationUtils'

import { useAppSelector } from '../../../state/hooks'
import { NavigationHook, RootStackParamList } from '../../../types/navigation'
import Header from '../../ui/Header'
import { PressableIcon } from '../../ui/PressableIcon'

type CommunityDetailsRouteProp = RouteProp<
    RootStackParamList,
    'CommunityDetails'
>

const CommunityDetailsHeader: React.FC = () => {
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()
    const route = useRoute<CommunityDetailsRouteProp>()
    const { communityId } = route.params
    const community = useAppSelector(s => selectCommunity(s, communityId))
    const showInviteCode = shouldShowInviteCode(community?.meta || {})

    return (
        <Header
            backButton
            headerCenter={
                <Text bold numberOfLines={1} adjustsFontSizeToFit>
                    {t('feature.communities.community-details')}
                </Text>
            }
            headerRight={
                showInviteCode && community ? (
                    <PressableIcon
                        svgName="Qr"
                        onPress={() =>
                            navigation.navigate('FederationInvite', {
                                inviteLink: community.inviteCode,
                            })
                        }
                    />
                ) : undefined
            }
        />
    )
}

export default CommunityDetailsHeader
