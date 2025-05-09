import { Text, Theme, useTheme } from '@rneui/themed'
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native'

import HoloGradient from './HoloGradient'

interface BaseProps {
    fullWidth?: boolean
    containerStyle?: StyleProp<ViewStyle>
}

type ChildProps =
    | {
          children: React.ReactNode
      }
    | {
          text: string
      }

const HoloAlert: React.FC<ChildProps & BaseProps> = ({
    fullWidth,
    containerStyle,
    ...props
}) => {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <HoloGradient
            gradientStyle={style.holoBorder}
            style={fullWidth ? style.fullWidth : {}}>
            <View style={[style.container, containerStyle]}>
                {'children' in props ? (
                    props.children
                ) : (
                    <Text caption style={style.alertText}>
                        {props.text}
                    </Text>
                )}
            </View>
        </HoloGradient>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        holoBorder: {
            borderRadius: 16,
            padding: 2,
            overflow: 'hidden',
        },
        container: {
            // border radius = outer radius - border width
            borderRadius: 14,
            padding: 16,
            backgroundColor: theme.colors.white,
            alignItems: 'center',
            justifyContent: 'center',
        },
        alertText: {
            color: theme.colors.darkGrey,
        },

        fullWidth: {
            width: '100%',
        },
    })

export default HoloAlert
