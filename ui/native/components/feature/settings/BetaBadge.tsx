import { Text, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { ImageBackground, StyleSheet, View } from 'react-native'

import { Images } from '../../../assets/images'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

export const BetaBadge = () => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const style = styles(theme)

    return (
        <ImageBackground style={style.betaBadge} source={Images.HoloBackground}>
            <View style={style.betaBadgeInner}>
                <SvgImage name="NorthStar" size={SvgImageSize.xs} />
                <Text caption medium>
                    {t('words.beta')}
                </Text>
            </View>
        </ImageBackground>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        betaBadge: {
            borderRadius: 12,
            padding: 2,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'row',
        },
        betaBadgeInner: {
            borderRadius: 8,
            padding: 4,
            backgroundColor: theme.colors.white,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 4,
        },
    })
