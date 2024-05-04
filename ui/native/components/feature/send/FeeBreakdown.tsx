import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import {
    Keyboard,
    Pressable,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native'

import { DetailItem } from '@fedi/common/utils/wallet'

import SvgImage, { SvgImageSize } from '../../ui/SvgImage'
import { FeeBreakdownItem } from './FeeBreakdownItem'

export interface FeeBreakdownProps {
    icon: React.ReactNode
    title: React.ReactNode
    guidanceText: string | React.ReactNode
    feeItems: DetailItem[]
    onClose: () => void
}

export const FeeBreakdown: React.FC<FeeBreakdownProps> = ({
    icon,
    title,
    guidanceText,
    feeItems,
    onClose,
}) => {
    const { theme } = useTheme()

    const style = styles(theme)

    return (
        <Pressable style={style.container} onPress={Keyboard.dismiss}>
            <TouchableOpacity
                style={style.closeIconContainer}
                onPress={() => onClose()}>
                <SvgImage name="Close" size={SvgImageSize.md} />
            </TouchableOpacity>
            {icon}
            <Text h2 h2Style={style.detailTitle}>
                {title}
            </Text>
            <View style={style.detailItemsContainer}>
                {feeItems.map((item, idx) => (
                    <FeeBreakdownItem
                        key={idx}
                        {...item}
                        // Hide the border on the last item, if we're not
                        // rendering the notes field as the last item.
                        noBorder={idx === feeItems.length - 1}
                    />
                ))}
                <Text caption medium style={style.feesGuidance}>
                    {guidanceText}
                </Text>
            </View>
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            alignItems: 'center',
            width: '100%',
        },
        closeIconContainer: {
            alignSelf: 'flex-end',
        },
        detailItemsContainer: {
            marginTop: theme.spacing.xl,
            gap: theme.spacing.xs,
            width: '100%',
        },
        detailTitle: {
            marginTop: theme.spacing.sm,
            marginBottom: theme.spacing.xxs,
        },
        feesGuidance: {
            marginTop: theme.spacing.md,
            padding: theme.spacing.lg,
            color: theme.colors.darkGrey,
            borderRadius: theme.borders.defaultRadius,
            borderColor: theme.colors.extraLightGrey,
            borderWidth: 1,
        },
    })
