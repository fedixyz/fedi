import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet } from 'react-native'

import { theme as fediTheme } from '@fedi/common/constants/theme'

import { SERVICE_CARD_BG } from '../../../constants/walletServiceTheme'
import { Row } from '../../ui/Flex'
import SvgImage from '../../ui/SvgImage'

/**
 * `error` is something that went wrong. `warn` is something that has not gone
 * wrong — the attach outlasting the time we watch it — and must not be dressed
 * as a failure.
 */
export type LightningBannerTone = 'error' | 'warn'

export type LightningBanner = {
    tone: LightningBannerTone
    message: string
}

/**
 * The status line for the Lightning attach, in the step screen and the settings
 * sheet alike.
 *
 * It renders under the host's title and above the provider card, because that
 * is where the reason for what the card is doing belongs — a banner below the
 * card explains a state the user has already tried to act on.
 */
export const LightningProviderBanner: React.FC<{
    banner: LightningBanner
    testID?: string
}> = ({ banner, testID }) => {
    const { theme } = useTheme()
    const style = styles(theme)
    const isError = banner.tone === 'error'

    return (
        <Row
            align="start"
            gap="sm"
            testID={testID}
            style={[style.banner, isError ? style.error : style.warn]}>
            <SvgImage
                name={isError ? 'AlertWarningTriangle' : 'Info'}
                size={15}
                color={isError ? theme.colors.red : theme.colors.darkGrey}
                containerStyle={style.icon}
            />
            <Text style={[style.text, isError && style.textError]}>
                {banner.message}
            </Text>
        </Row>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        banner: {
            borderRadius: 12,
            borderWidth: 1,
            // axis-specific: Row's base container sets paddingVertical and
            // paddingHorizontal, and those beat the padding shorthand
            paddingHorizontal: 12,
            paddingVertical: 10,
        },
        error: {
            backgroundColor: theme.colors.red100,
            borderColor: theme.colors.red,
        },
        warn: {
            backgroundColor: SERVICE_CARD_BG,
            borderColor: theme.colors.dividerGrey,
        },
        icon: {
            paddingTop: 1,
        },
        text: {
            color: theme.colors.darkGrey,
            flex: 1,
            fontSize: fediTheme.fontSizes.small,
            lineHeight: 17,
        },
        textError: {
            color: theme.colors.red,
        },
    })
