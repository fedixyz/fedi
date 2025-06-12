import { Text, Theme, useTheme } from '@rneui/themed'
import { StyleSheet } from 'react-native'

import { theme as fediTheme } from '@fedi/common/constants/theme'

import Flex from '../../ui/Flex'
import HoloGradient from '../../ui/HoloGradient'

type Props = {
    message: string
}
const WelcomeMessage = ({ message }: Props) => {
    const { theme } = useTheme()
    const style = styles(theme)
    return (
        <Flex justify="center">
            <HoloGradient
                level="100"
                locations={fediTheme.holoGradientLocations.radial}
                gradientStyle={style.content}>
                <Text caption style={style.message}>
                    {message}
                </Text>
            </HoloGradient>
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
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
