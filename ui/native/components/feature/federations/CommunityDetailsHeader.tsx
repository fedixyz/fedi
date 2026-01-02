import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { COMMUNITY_TOOL_URL } from '@fedi/common/constants/fedimods'
import { useCreatedCommunities } from '@fedi/common/hooks/federation'
import { openMiniAppSession, selectCommunity } from '@fedi/common/redux'
import { shouldShowInviteCode } from '@fedi/common/utils/FederationUtils'

import { useAppDispatch, useAppSelector } from '../../../state/hooks'
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
    const dispatch = useAppDispatch()
    const navigation = useNavigation<NavigationHook>()
    const route = useRoute<CommunityDetailsRouteProp>()
    const { communityId } = route.params
    const community = useAppSelector(s => selectCommunity(s, communityId))
    const showInviteCode = shouldShowInviteCode(community?.meta || {})
    const { canEditCommunity } = useCreatedCommunities(communityId)

    const handleEditCommunity = () => {
        dispatch(
            openMiniAppSession({
                miniAppId: COMMUNITY_TOOL_URL,
                url: COMMUNITY_TOOL_URL,
            }),
        )
        navigation.navigate('FediModBrowser')
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
