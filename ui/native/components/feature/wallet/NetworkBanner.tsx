import { Text, Theme, useTheme } from '@rneui/themed'
import capitalize from 'lodash/capitalize'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { selectActiveFederation } from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import Flex from '../../ui/Flex'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

export const NetworkBanner: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const activeFederation = useAppSelector(selectActiveFederation)

    if (
        !activeFederation ||
        !activeFederation.hasWallet ||
        activeFederation.network === 'bitcoin'
    )
        return null

    const style = styles(theme)
    return (
        <Flex row center gap="xs" fullWidth>
            <SvgImage
                color={theme.colors.night}
                name="Info"
                size={SvgImageSize.xs}
                maxFontSizeMultiplier={1.2}
            />
            <Text
                small
                medium
                style={style.text}
                adjustsFontSizeToFit
                numberOfLines={1}>
                {t('feature.wallet.network-notice', {
                    network: capitalize(activeFederation.network ?? 'unknown'),
                })}
            </Text>
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            padding: theme.spacing.sm,
            backgroundColor: '#FFFAEB', // TODO: add to theme.colors
        },
        text: {
            color: theme.colors.night,
        },
    })
