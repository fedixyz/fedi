import { Text, Theme, useTheme } from '@rneui/themed'
import toLower from 'lodash/toLower'
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
        <View style={[style.container, style.shrink]}>
            <SvgImage
                name="UsdCircle"
                size={SvgImageSize.md}
                color={theme.colors.white}
            />
            <View style={style.shrink}>
                <View style={[style.row, style.shrink]}>
                    <Text
                        medium
                        style={style.title}
                        adjustsFontSizeToFit
                        numberOfLines={1}>
                        {`${toUpper(selectedCurrency)} ${toLower(
                            t('words.balance'),
                        )}`}
                    </Text>
                </View>
                <SvgImage
                    name="Beta"
                    dimensions={{ width: 50, height: 20 }}
                    color={theme.colors.secondary}
                />
            </View>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        title: {
            color: theme.colors.secondary,
            flexShrink: 1,
        },
        container: {
            flexDirection: 'row',
            maxWidth: '60%',
            textAlign: 'left',
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: theme.spacing.sm,
        },
        shrink: {
            flex: 1,
            flexShrink: 1,
        },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
        },
    })

export default WalletHeader
