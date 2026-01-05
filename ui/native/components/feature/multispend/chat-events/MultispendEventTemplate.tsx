import { Theme, useTheme, Text, Button } from '@rneui/themed'
import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { Row, Column } from '../../../ui/Flex'

type Props = {
    heading?: ReactNode
    body?: ReactNode
    footer?: ReactNode
    button?: {
        title: string
        onPress: () => void
    }
}

const MultispendEventTemplate: React.FC<Props> = ({
    heading,
    body,
    footer,
    button,
}) => {
    const { theme } = useTheme()
    const style = styles(theme)
    const { t } = useTranslation()

    return (
        <View style={[style.bubble, { width: theme.sizes.maxMessageWidth }]}>
            {heading && (
                <Row align="center" justify="between">
                    <Text style={style.headerText} caption bold>
                        {t('feature.multispend.message-header')}
                    </Text>
                </Row>
            )}
            <Column gap="md" style={style.body}>
                {typeof body === 'string' ? (
                    <Text caption style={style.incomingText}>
                        {body}
                    </Text>
                ) : (
                    body
                )}
                {footer && typeof footer === 'string' ? (
                    <Text caption style={style.incomingText}>
                        {footer}
                    </Text>
                ) : (
                    footer
                )}
            </Column>
            {button && (
                <Button
                    containerStyle={style.button}
                    size="sm"
                    title={
                        <Text color={theme.colors.white} caption bold>
                            {button.title}
                        </Text>
                    }
                    onPress={button.onPress}
                    type="solid"
                    color={theme.colors.primary}
                />
            )}
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        headerText: { color: theme.colors.night },
        body: { paddingVertical: theme.spacing.md },
        bubble: {
            padding: 10,
            width: theme.sizes.maxMessageWidth,
            backgroundColor: theme.colors.extraLightGrey,
        },
        incomingText: {
            color: theme.colors.primary,
        },
        button: {
            marginVertical: theme.spacing.sm,
        },
    })

export default MultispendEventTemplate
