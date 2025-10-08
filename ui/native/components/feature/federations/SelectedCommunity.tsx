import { useNavigation } from '@react-navigation/native'
import { Text, useTheme, type Theme } from '@rneui/themed'
import React from 'react'
import { StyleSheet } from 'react-native'

import { Community } from '@fedi/common/types'

import { NavigationHook } from '../../../types/navigation'
import { Pressable } from '../../ui/Pressable'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'
import { FederationLogo } from './FederationLogo'

export type Props = { community: Community }

const SelectedCommunity: React.FC<Props> = ({ community }) => {
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()
    const style = styles(theme)

    const goToCommunityDetails = () => {
        navigation.navigate('CommunityDetails', {
            communityId: community.id,
        })
    }

    return (
        <Pressable
            containerStyle={style.tileContainer}
            onPress={goToCommunityDetails}>
            <FederationLogo federation={community} size={56} />
            <Text
                h2
                bold
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
                ellipsizeMode="tail"
                h2Style={style.title}>
                {community?.name}
            </Text>
            <SvgImage
                name="ChevronRight"
                color={theme.colors.grey}
                containerStyle={style.icon}
                size={SvgImageSize.sm}
            />
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        tileContainer: {
            width: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.lg,
            paddingVertical: 0,
            paddingHorizontal: 0,
            minWidth: 0,
        },
        icon: {
            marginLeft: 'auto',
        },
        title: {
            color: theme.colors.primary,
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: 0,
            minWidth: 0,
        },
    })

export default SelectedCommunity
