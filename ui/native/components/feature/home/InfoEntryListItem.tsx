import { Text, Theme } from '@rneui/themed'
import React, { useMemo } from 'react'
import { View, StyleSheet } from 'react-native'

import { theme as globalTheme } from '@fedi/common/constants/theme'

import { BubbleView } from '../../ui/BubbleView'
import Flex from '../../ui/Flex'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'
import { FirstTimeOverlayItem } from '../onboarding/FirstTimeOverlay'

export interface InfoEntryListItemProps {
    item: FirstTimeOverlayItem
    theme: Theme
}
const InfoEntryListItem: React.FC<InfoEntryListItemProps> = ({
    item,
    theme,
}) => {
    const iconStyles = useMemo(() => createIconStyles(theme), [theme])

    return (
        <Flex row align="center" gap="md">
            <View style={iconStyles.wrapper}>
                <BubbleView containerStyle={iconStyles.bubble}>
                    <SvgImage
                        name={item.icon}
                        size={SvgImageSize.sm}
                        color={theme.colors.white}
                    />
                </BubbleView>
            </View>
            <Text caption style={styles.itemText}>
                {item.text}
            </Text>
        </Flex>
    )
}

const createIconStyles = (theme: Theme) => {
    const size = 40
    return StyleSheet.create({
        wrapper: {
            marginRight: 8,
            borderRadius: theme.borders.tileRadius,
            elevation: 4,
        },
        bubble: {
            width: size,
            height: size,
            borderRadius: theme.borders.tileRadius,
            backgroundColor: theme.colors.night,
            alignItems: 'center',
            justifyContent: 'center',
        },
    })
}

const styles = StyleSheet.create({
    itemText: {
        flex: 1,
        color: globalTheme.colors.darkGrey,
    },
})

export default InfoEntryListItem
