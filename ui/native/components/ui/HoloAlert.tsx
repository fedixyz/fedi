import { Text, Theme, useTheme } from '@rneui/themed'
import { StyleProp, StyleSheet, ViewStyle } from 'react-native'

import { Column } from './Flex'
import GradientView from './GradientView'

interface BaseProps {
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
    containerStyle,
    ...props
}) => {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <GradientView variant="sky-heavy" style={style.holoBorder}>
            <Column center style={[style.container, containerStyle]}>
                {'children' in props ? (
                    props.children
                ) : (
                    <Text caption style={style.alertText}>
                        {props.text}
                    </Text>
                )}
            </Column>
        </GradientView>
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
        },
        alertText: {
            color: theme.colors.darkGrey,
        },
    })

export default HoloAlert
