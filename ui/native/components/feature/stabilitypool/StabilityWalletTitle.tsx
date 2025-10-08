import { Text, Theme, useTheme } from '@rneui/themed'
import toUpper from 'lodash/toUpper'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { selectCurrency } from '@fedi/common/redux'
import { LoadedFederation } from '@fedi/common/types'

import { useAppSelector } from '../../../state/hooks'
import Flex from '../../ui/Flex'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

type Props = {
    federation: LoadedFederation
}
const WalletHeader: React.FC<Props> = ({ federation }) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const selectedCurrency = useAppSelector(s =>
        selectCurrency(s, federation.id),
    )

    const style = styles(theme)

    if (!federation) return null

    return (
        <Flex row grow align="center" justify="start" gap="sm">
            <SvgImage
                name="UsdCircleFilled"
                size={SvgImageSize.sm}
                color={theme.colors.mint}
            />
            <Flex row align="center" shrink style={style.labelRow}>
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
            </Flex>
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        labelRow: {
            minWidth: 0,
        },
        title: {
            color: theme.colors.primary,
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
