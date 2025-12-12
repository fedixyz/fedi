import { Text, Theme, useTheme } from '@rneui/themed'
import { StyleSheet } from 'react-native'

import { stripAndDeduplicateWhitespace } from '@fedi/common/utils/strings'

import GradientView from '../../ui/GradientView'
import SvgImage from '../../ui/SvgImage'

type Props = {
    message: string
}
const PinnedMessage = ({ message }: Props) => {
    const { theme } = useTheme()
    const style = styles(theme)
    return (
        <GradientView variant="sky-banner" style={style.content}>
            <SvgImage name="Pin" />
            <Text caption style={style.message}>
                {stripAndDeduplicateWhitespace(message)}
            </Text>
        </GradientView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        content: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.md,
            paddingVertical: theme.spacing.lg,
            paddingHorizontal: theme.spacing.xl,
            borderRadius: theme.borders.defaultRadius,
        },
        message: {
            flex: 1,
            letterSpacing: -0.1,
            lineHeight: 18,
        },
    })

export default PinnedMessage
