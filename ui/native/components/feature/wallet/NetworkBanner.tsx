import { Text, Theme, useTheme } from '@rneui/themed'
import capitalize from 'lodash/capitalize'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { selectActiveFederation } from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import { Network } from '../../../types'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

export const NetworkBanner: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const activeFederation = useAppSelector(selectActiveFederation)

    if (
        !activeFederation ||
        !activeFederation.hasWallet ||
        activeFederation.network === Network.bitcoin
    )
        return null

    const style = styles(theme)
    return (
        <View style={style.container}>
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
                    network: capitalize(activeFederation.network),
                })}
            </Text>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            width: '100%',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            padding: theme.spacing.sm,
            gap: theme.spacing.xs,
            backgroundColor: '#FFFAEB', // TODO: add to theme.colors
        },
        text: {
            color: theme.colors.night,
        },
    })
