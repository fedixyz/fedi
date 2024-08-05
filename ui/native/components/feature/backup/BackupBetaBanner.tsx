import { Text, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { ImageBackground, StyleSheet, View } from 'react-native'

import { Images } from '../../../assets/images'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

export default function BetaBanner() {
    const { t } = useTranslation()
    const { theme } = useTheme()

    const style = styles(theme)

    return (
        <View style={[style.container]}>
            <ImageBackground
                source={Images.HoloBackground}
                style={style.gradient}>
                <SvgImage name="NorthStar" size={SvgImageSize.sm} />
                <Text>{t('feature.backup.beta-backup')}</Text>
            </ImageBackground>
        </View>
    )
}

const styles = (_: Theme) =>
    StyleSheet.create({
        container: {
            display: 'flex',
        },
        gradient: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            padding: 8,
        },
    })
