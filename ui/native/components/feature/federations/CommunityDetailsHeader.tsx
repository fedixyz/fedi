import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import {
    COMMUNITY_TOOL_URL_PROD,
    COMMUNITY_TOOL_URL_STAGING,
} from '@fedi/common/constants/fedimods'
import { useCreatedCommunities } from '@fedi/common/hooks/federation'
import { selectCommunity } from '@fedi/common/redux'
import { shouldShowInviteCode } from '@fedi/common/utils/FederationUtils'
import { isDev, isNightly } from '@fedi/common/utils/environment'

import { useAppSelector } from '../../../state/hooks'
import { NavigationHook, RootStackParamList } from '../../../types/navigation'
import { Row } from '../../ui/Flex'
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
    const { canEditCommunity } = useCreatedCommunities(communityId)

    const handleEditCommunity = () => {
        navigation.navigate('FediModBrowser', {
            url:
                isNightly() || isDev()
                    ? COMMUNITY_TOOL_URL_STAGING
                    : COMMUNITY_TOOL_URL_PROD,
        })
    }

    const handleShowQr = () => {
        if (!community) return
        navigation.navigate('CommunityInvite', {
            inviteLink: community.communityInvite.invite_code_str,
        })
    }

    return (
        <Header
            backButton
            headerCenter={
                <Text bold numberOfLines={1} adjustsFontSizeToFit>
                    {t('feature.communities.community-details')}
                </Text>
            }
            headerRight={
                community ? (
                    <Row gap="sm">
                        {canEditCommunity && (
                            <PressableIcon
                                svgName="Edit"
                                onPress={handleEditCommunity}
                            />
                        )}
                        {showInviteCode && (
                            <PressableIcon
                                svgName="Qr"
                                onPress={handleShowQr}
                            />
                        )}
                    </Row>
                ) : undefined
            }
        />
    )
}

export default CommunityDetailsHeader
