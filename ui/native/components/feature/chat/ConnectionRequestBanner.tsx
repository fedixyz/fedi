import { useNavigation } from '@react-navigation/native'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { addRejectedMatrixRoom, joinMatrixRoom } from '@fedi/common/redux'

import { useAppDispatch } from '../../../state/hooks'
import { resetToChatsScreen } from '../../../state/navigation'
import { Column, Row } from '../../ui/Flex'
import GradientView from '../../ui/GradientView'
import { ChatInfoIcon } from './ChatInfoIcon'

type Props = {
    username: string
    roomId: string
}

const ConnectionRequestBanner: React.FC<Props> = ({ username, roomId }) => {
    const { theme } = useTheme()
    const style = styles(theme)
    const fedimint = useFedimint()
    const dispatch = useAppDispatch()
    const navigation = useNavigation()

    const { t } = useTranslation()

    const handleAccept = useCallback(() => {
        dispatch(joinMatrixRoom({ fedimint, roomId }))
    }, [dispatch, fedimint, roomId])

    const handleReject = useCallback(async () => {
        await dispatch(addRejectedMatrixRoom(roomId))
        navigation.dispatch(resetToChatsScreen())
    }, [dispatch, navigation, roomId])

    return (
        <GradientView
            variant="sky-banner"
            style={style.container}
            testID="connection-request-banner">
            <Column gap="md" style={style.content}>
                <Row align="center" justify="center" gap="xs">
                    <Text bolder>{t('phrases.connect-request')}</Text>
                    <ChatInfoIcon />
                </Row>

                <Text center style={style.descriptionText}>
                    <Trans
                        t={t}
                        i18nKey="feature.chat.connection-request-guidance"
                        values={{ username: `@${username}` }}
                        components={{
                            bold: <Text bold />,
                        }}
                    />
                </Text>

                <Row gap="md" style={style.actionsRow}>
                    <Button
                        title="Reject"
                        onPress={handleReject}
                        size="sm"
                        outline
                        day
                        containerStyle={style.actionButton}
                    />
                    <Button
                        title="Accept"
                        onPress={handleAccept}
                        size="sm"
                        containerStyle={style.actionButton}
                    />
                </Row>
            </Column>
        </GradientView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            width: '100%',
            borderRadius: theme.borders.defaultRadius,
        },
        content: {
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.lg,
        },
        descriptionText: {
            lineHeight: 22,
        },
        actionsRow: {
            width: '100%',
        },
        actionButton: {
            flex: 1,
        },
    })

export default ConnectionRequestBanner
