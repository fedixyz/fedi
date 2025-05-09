import { Text, Theme, useTheme } from '@rneui/themed'
import toUpper from 'lodash/toUpper'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { selectCurrency } from '@fedi/common/redux'
import { selectActiveFederation } from '@fedi/common/redux/federation'

import { useAppSelector } from '../../../state/hooks'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

const WalletHeader: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const activeFederation = useAppSelector(selectActiveFederation)
    const selectedCurrency = useAppSelector(selectCurrency)

    const style = styles(theme)

    if (!activeFederation) return null

    return (
        <View style={style.container}>
            <SvgImage
                name="UsdCircle"
                size={SvgImageSize.md}
                color={theme.colors.white}
            />
            <View style={style.labelRow}>
                <Text
                    medium
                    style={style.title}
                    adjustsFontSizeToFit
                    minimumFontScale={0.5}
                    numberOfLines={1}>
                    {`${toUpper(selectedCurrency)} ${t(
                        'feature.stabilitypool.stable-balance',
                    )}`}
                </Text>

                <SvgImage
                    name="ChevronRightSmall"
                    color={theme.colors.secondary}
                    dimensions={style.chevronDimensions}
                    svgProps={{ style: style.chevron }}
                />
            </View>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flexDirection: 'row',
            flex: 1,
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: theme.spacing.sm,
        },
        labelRow: {
            flexDirection: 'row',
            alignItems: 'center',
            flexShrink: 1,
            minWidth: 0,
        },
        title: {
            color: theme.colors.secondary,
            flexShrink: 1,
        },
        chevron: {
            marginLeft: theme.spacing.md,
            top: 1,
        },
        chevronDimensions: {
            width: 6,
            height: 12,
        },
    })

export default WalletHeader
