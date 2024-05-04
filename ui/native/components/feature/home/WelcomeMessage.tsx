import { Text, Theme, useTheme } from '@rneui/themed'
import { StyleSheet, View } from 'react-native'

import { theme as fediTheme } from '@fedi/common/constants/theme'

import HoloGradient from '../../ui/HoloGradient'

type Props = {
    message: string
}
const WelcomeMessage = ({ message }: Props) => {
    const { theme } = useTheme()
    const style = styles(theme)
    return (
        <View style={style.container}>
            <HoloGradient
                level="100"
                locations={fediTheme.holoGradientLocations.radial}
                gradientStyle={style.content}>
                <Text caption style={style.message}>
                    {message}
                </Text>
            </HoloGradient>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            display: 'flex',
            justifyContent: 'center',
        },
        content: {
            padding: theme.spacing.lg,
            borderRadius: theme.borders.defaultRadius,
        },
        message: {
            flex: 1,
            letterSpacing: -0.1,
            lineHeight: 18,
            textAlign: 'center',
        },
    })

export default WelcomeMessage
