import { Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { Pressable, StyleSheet } from 'react-native'

import {
    selectCommunityStack,
    selectLastSelectedCommunity,
} from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import AvatarStack from '../../ui/AvatarStack'
import GradientView from '../../ui/GradientView'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'
import CommunitiesOverlay from './CommunitiesOverlay'
import { FederationLogo } from './FederationLogo'

const CommunitySelector: React.FC = () => {
    const { theme } = useTheme()
    const selectedCommunity = useAppSelector(selectLastSelectedCommunity)
    const communityStack = useAppSelector(selectCommunityStack)
    const [showCommunities, setShowCommunities] = useState(false)

    const style = styles(theme)

    const openCommunitiesOverlay = () => {
        setShowCommunities(true)
    }

    if (!selectedCommunity) return <></>

    return (
        <>
            <Pressable
                testID={selectedCommunity.name
                    .concat('SelectorButton')
                    .replaceAll(' ', '')}
                onPress={openCommunitiesOverlay}>
                <GradientView
                    variant="sky-banner"
                    style={style.gradientContainer}>
                    <GradientView variant="white" style={style.content}>
                        <AvatarStack
                            data={communityStack}
                            stackDirection="rtl"
                            renderAvatar={(item, size) => (
                                <FederationLogo
                                    federation={item}
                                    size={size}
                                    shape="circle"
                                />
                            )}
                        />
                        <SvgImage
                            name="ChevronDown"
                            size={SvgImageSize.sm}
                            color={theme.colors.primary}
                        />
                    </GradientView>
                </GradientView>
            </Pressable>
            <CommunitiesOverlay
                open={showCommunities}
                onOpenChange={setShowCommunities}
            />
        </>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        gradientContainer: {
            padding: theme.spacing.xxs,
            borderRadius: 50,
        },
        content: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            alignSelf: 'center',
            padding: theme.spacing.xs,
            paddingRight: theme.spacing.md,
            gap: theme.spacing.sm,
            borderRadius: 50,
        },
        federationName: {
            flexGrow: 1,
            maxWidth: '85%',
        },
    })

export default CommunitySelector
