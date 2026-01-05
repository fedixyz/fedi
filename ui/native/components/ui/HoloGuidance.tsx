import { Text, TextProps, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet } from 'react-native'

import { Column } from './Flex'
import HoloCircle from './HoloCircle'

type HoloGuidanceProps = {
    iconImage?: React.ReactNode | null
    title?: string | null
    titleProps?: TextProps | null
    message?: string | null
    body?: React.ReactNode | null
    size?: 'default' | 'small'
    noFlexContainer?: boolean
}

const DEFAULT_TITLE_PROPS = {
    h2: true,
    style: {},
}

const HoloGuidance: React.FC<HoloGuidanceProps> = ({
    iconImage = null,
    title,
    titleProps = DEFAULT_TITLE_PROPS,
    message,
    body,
    size = 'default',
    noFlexContainer = false,
}: HoloGuidanceProps) => {
    const { theme } = useTheme()

    const mergedTitleProps = {
        ...titleProps,
    }
    // Annoying RNE makes us use h2Style instead of style to apply these
    // if an h2 prop is used
    if (titleProps?.h2) {
        mergedTitleProps.h2Style = [
            styles(theme).title,
            titleProps.style ? titleProps.style : {},
        ]
    } else {
        mergedTitleProps.style = [
            styles(theme).title,
            titleProps?.style ? titleProps.style : {},
        ]
    }

    return (
        <Column center grow={!noFlexContainer}>
            <HoloCircle
                size={size === 'default' ? theme.sizes.holoGuidanceCircle : 64}
                content={iconImage}
            />
            {body ? (
                body
            ) : (
                <>
                    <Text {...mergedTitleProps}>{title}</Text>
                    <Text style={styles(theme).message}>{message}</Text>
                </>
            )}
        </Column>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        title: {
            textAlign: 'center',
            marginVertical: theme.spacing.lg,
        },
        message: {
            textAlign: 'center',
            paddingHorizontal: theme.spacing.xl,
            fontWeight: '400',
        },
        holoCircle: {
            height: theme.sizes.holoGuidanceCircle,
            width: theme.sizes.holoGuidanceCircle,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 4,
        },
        holoDefault: {
            height: theme.sizes.holoGuidanceCircle,
            width: theme.sizes.holoGuidanceCircle,
        },
        circleBorderDefault: {
            borderRadius: theme.sizes.holoGuidanceCircle * 0.5,
        },
        holoSmall: {
            height: 64,
            width: 64,
        },
        circleBorderSmall: {
            borderRadius: 32,
        },
        iconImage: {
            height: theme.sizes.lg,
            width: theme.sizes.lg,
        },
    })

export default HoloGuidance
