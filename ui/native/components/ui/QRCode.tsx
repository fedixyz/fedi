import { Theme, useTheme } from '@rneui/themed'
import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { SvgXml } from 'react-native-svg'

import { renderStyledQrSvg } from '@fedi/common/utils/qrcode'

interface Props {
    value: string
    size: number
    logoOverrideUrl?: string
}

const QRCode: React.FC<Props> = ({ value, size, logoOverrideUrl }) => {
    const { theme } = useTheme()

    const style = styles(theme)

    const xml = useMemo(
        () =>
            renderStyledQrSvg(value, {
                hideLogo: false,
                moduleShape: 'dot',
                logoOverrideUrl,
            }),
        [value, logoOverrideUrl],
    )

    return (
        <View style={[style.container, { width: size, height: size }]}>
            <SvgXml xml={xml} />
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            position: 'relative',
            width: '100%',
            aspectRatio: '1 / 1',
            backgroundColor: theme.colors.white,
            borderRadius: 16,
        },
    })

export default QRCode
