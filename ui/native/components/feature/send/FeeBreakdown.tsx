import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet, View } from 'react-native'

import { DetailItem } from '@fedi/common/utils/transaction'

import { Column } from '../../ui/Flex'
import { PressableIcon } from '../../ui/PressableIcon'
import { SvgImageSize } from '../../ui/SvgImage'
import { FeeBreakdownItem } from './FeeBreakdownItem'

export type FeeBreakdownProps = {
    icon: React.ReactNode
    title: React.ReactNode
    guidanceText?: string | React.ReactNode
    feeItems: DetailItem[]
    onClose: () => void
    showBack?: boolean
    onPressBack?: () => void
}

export const FeeBreakdown: React.FC<FeeBreakdownProps> = ({
    icon,
    title,
    guidanceText,
    feeItems,
    onClose,
    showBack = false,
    onPressBack = () => null,
}) => {
    const { theme } = useTheme()

    const style = styles(theme)

    return (
        <Column align="center" fullWidth>
            <View style={style.headerButtons}>
                <PressableIcon
                    svgName="ChevronLeft"
                    onPress={() => onPressBack()}
                    svgProps={{ size: SvgImageSize.md }}
                    containerStyle={[
                        style.backIconContainer,
                        !showBack && style.hide,
                    ]}
                />
                <PressableIcon
                    containerStyle={style.closeIconContainer}
                    svgName="Close"
                    svgProps={{ size: SvgImageSize.md }}
                    onPress={() => onClose()}
                />
            </View>
            {icon}
            <Text h2 h2Style={style.detailTitle}>
                {title}
            </Text>
            <Column gap="xs" fullWidth style={style.detailItemsContainer}>
                {feeItems.map((item, idx) => (
                    <FeeBreakdownItem
                        key={idx}
                        {...item}
                        // Hide the border on the last item, if we're not
                        // rendering the notes field as the last item.
                        noBorder={idx === feeItems.length - 1}
                    />
                ))}
                {guidanceText && (
                    <Text caption medium style={style.feesGuidance}>
                        {guidanceText}
                    </Text>
                )}
            </Column>
        </Column>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        closeIconContainer: {
            position: 'absolute',
            top: -5,
            right: -5,
        },
        backIconContainer: {
            position: 'absolute',
            top: -5,
            left: -5,
        },
        detailItemsContainer: {
            marginTop: theme.spacing.xl,
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
        headerButtons: {
            position: 'relative',
            height: theme.spacing.lg,
            alignSelf: 'stretch',
        },
        hide: {
            display: 'none',
        },
    })
