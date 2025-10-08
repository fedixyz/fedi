import { Button, Text, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { ChatEventAction, useMatrixFormEvent } from '@fedi/common/hooks/matrix'
import { MatrixEvent } from '@fedi/common/types'

import Flex from '../../ui/Flex'
import { OptionalGradient } from '../../ui/OptionalGradient'
import { bubbleGradient } from './ChatEvent'

type Props = {
    event: MatrixEvent<'xyz.fedi.form'>
    isWide?: boolean
}

export const ActionEventButton = ({ action }: { action: ChatEventAction }) => {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <Flex
            row
            justify="start"
            gap="md"
            fullWidth
            style={style.actionButtons}>
            <Button
                key={action.label}
                color={theme.colors.secondary}
                size="sm"
                onPress={action.handler}
                loading={action.loading}
                disabled={action.disabled}
                title={
                    <Text medium caption style={style.buttonText}>
                        {action.label}
                    </Text>
                }
            />
        </Flex>
    )
}

export const Options = ({ options }: { options: ChatEventAction[] }) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <Flex
            justify="start"
            align="start"
            gap="md"
            fullWidth
            style={style.actionButtons}>
            {options.map(option => (
                <Flex row gap="md" align="center" justify="between">
                    <Text medium caption style={style.optionText}>
                        {option.label}
                    </Text>
                    <Button
                        key={option.label}
                        color={theme.colors.secondary}
                        size="sm"
                        onPress={option.handler}
                        loading={option.loading}
                        disabled={option.disabled}
                        title={
                            <Text medium caption style={style.buttonText}>
                                {t('words.select')}
                            </Text>
                        }
                    />
                </Flex>
            ))}
        </Flex>
    )
}

export const FormEventContainer = ({
    children,
}: {
    children: React.ReactNode
}) => {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <OptionalGradient
            gradient={bubbleGradient}
            style={[style.bubbleInner, style.greyBubble]}>
            {children}
        </OptionalGradient>
    )
}

const ChatFormEvent: React.FC<Props> = ({ event }) => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    const { isSentByMe, messageText, actionButton, options } =
        useMatrixFormEvent(event, t)

    let extra: React.ReactNode = null
    if (actionButton || options.length > 0) {
        extra = (
            <>
                {actionButton && <ActionEventButton action={actionButton} />}
                {options.length > 0 && <Options options={options} />}
            </>
        )
    }

    return (
        <FormEventContainer>
            <>
                {messageText && (
                    <Text
                        color={
                            isSentByMe
                                ? theme.colors.grey
                                : theme.colors.secondary
                        }
                        style={
                            isSentByMe ? { fontStyle: 'italic' } : undefined
                        }>
                        {messageText}
                    </Text>
                )}
            </>
            {extra || null}
        </FormEventContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        buttonContainer: {
            flex: 1,
            maxWidth: '50%',
        },
        buttonText: {
            paddingHorizontal: theme.spacing.lg,
        },
        actionButtons: {
            marginTop: 0,
        },
        optionText: {
            flex: 1,
        },
        greyBubble: {
            backgroundColor: theme.colors.extraLightGrey,
        },
        bubbleInner: {
            padding: 10,
        },
    })

export default ChatFormEvent
