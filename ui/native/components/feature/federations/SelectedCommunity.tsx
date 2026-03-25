import { useNavigation } from '@react-navigation/native'
import { Text, useTheme, type Theme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { Community } from '@fedi/common/types'

import { NavigationHook } from '../../../types/navigation'
import { Column, Row } from '../../ui/Flex'
import { Pressable } from '../../ui/Pressable'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'
import { FederationLogo } from './FederationLogo'

export type Props = { community: Community }

const SelectedCommunity: React.FC<Props> = ({ community }) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()

    const style = styles(theme)

    const goToCommunityDetails = () => {
        navigation.navigate('CommunityDetails', {
            communityId: community.id,
        })
    }

    return (
        <Pressable onPress={goToCommunityDetails}>
            <Row align="center" fullWidth gap="md">
                <FederationLogo federation={community} size={56} />
                <Column style={style.center}>
                    <Text
                        h2
                        bold
                        numberOfLines={2}
                        style={style.titleContainer}
                        h2Style={style.title}>
                        {community?.name}
                    </Text>
                    {community.status === 'deleted' && (
                        <Text caption style={{ color: theme.colors.red }}>
                            {t('feature.communities.community-deleted')}
                        </Text>
                    )}
                </Column>
                <SvgImage
                    name="ChevronRight"
                    color={theme.colors.grey}
                    size={SvgImageSize.sm}
                />
            </Row>
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        center: {
            flex: 1,
        },
        titleContainer: {
            flexShrink: 1,
        },
        title: {
            color: theme.colors.primary,
        },
    })

export default SelectedCommunity
