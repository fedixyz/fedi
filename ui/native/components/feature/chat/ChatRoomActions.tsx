import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import {
    selectMatrixRoomNotificationMode,
    updateMatrixRoomNotificationMode,
} from '@fedi/common/redux'
import { MatrixRoom } from '@fedi/common/types'
import { RpcRoomNotificationMode } from '@fedi/common/types/bindings'
import { makeLog } from '@fedi/common/utils/log'
import SvgImage, { SvgImageName } from '@fedi/native/components/ui/SvgImage'
import { useAppDispatch, useAppSelector } from '@fedi/native/state/hooks'
import { resetToChatSettings } from '@fedi/native/state/navigation'

import Flex from '../../ui/Flex'
import ChatRoomAction from './ChatAction'

export type Props = {
    room: MatrixRoom
    dismiss: () => void
}

type Action = {
    id: number
    dataId?: string
    label: string
    icon: SvgImageName
    onPress: () => void
}

const log = makeLog('chat/ChatRoomActions')

const ChatRoomActions: React.FC<Props> = ({ room, dismiss }: Props) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const navigation = useNavigation()
    const dispatch = useAppDispatch()
    const { error, show } = useToast()
    const [loadingAction, setLoadingAction] = useState<number | null>(null)
    const notificationMode = useAppSelector(s =>
        selectMatrixRoomNotificationMode(s, room.id),
    )

    const actions: Action[] = [
        {
            id: 0,
            label: t('feature.chat.open-chat'),
            icon: 'Chat',
            onPress: async () => {
                setLoadingAction(0)
                navigation.navigate('ChatRoomConversation', {
                    roomId: room.id,
                })
                dismiss()
                setLoadingAction(null)
            },
        },
        {
            id: 1,
            label: t('feature.chat.chat-settings'),
            icon: 'Cog',
            onPress: async () => {
                setLoadingAction(1)
                navigation.dispatch(resetToChatSettings(room.id))
                dismiss()
                setLoadingAction(null)
            },
        },
    ]
    const handleUpdateNotificationMode = async (
        id: number,
        mode: RpcRoomNotificationMode,
    ) => {
        setLoadingAction(id)
        try {
            log.info(`Updating notifications for room ${room.id} to ${mode}`)
            await dispatch(
                updateMatrixRoomNotificationMode({ roomId: room.id, mode }),
            ).unwrap()
            show({
                content: t('feature.chat.notification-update-success'),
                status: 'success',
            })
        } catch (err) {
            log.error('Failed to update notifications for room', err)
            error(t, 'feature.errors.failed-to-update-notification')
        }
        setLoadingAction(null)
        dismiss()
    }

    const notificationActions: Action[] = [
        {
            id: 2,
            dataId: 'allMessages',
            label: t('feature.chat.notification-always'),
            icon: 'Bell',
            onPress: () => handleUpdateNotificationMode(2, 'allMessages'),
        },
        // TODO: implement mentions notification mode
        // {
        //     id: 2,
        //     label: t('feature.chat.notification-mentions'),
        //     dataId: 'mentionsAndKeywordsOnly',
        //     icon: 'User',
        //     onPress: () =>
        //         handleUpdateNotificationMode(2, 'mentionsAndKeywordsOnly'),
        // },
        {
            id: 3,
            dataId: 'mute',
            label: t('feature.chat.notification-mute'),
            icon: 'Close',
            onPress: () => handleUpdateNotificationMode(3, 'mute'),
        },
    ]

    const getIsDisabled = (dataId?: string) => {
        if (!dataId) return true
        if (dataId === notificationMode) return true
        return false
    }

    return (
        <View style={styles(theme).container}>
            <Flex align="start">
                <Text
                    caption
                    style={styles(theme).sectionTitle}
                    numberOfLines={1}
                    adjustsFontSizeToFit>
                    {t('words.actions')}
                </Text>
                {actions.map(action => (
                    <ChatRoomAction
                        key={action.id}
                        leftIcon={<SvgImage name={action.icon} />}
                        rightIcon={<SvgImage name={'ChevronRight'} />}
                        label={action.label}
                        isLoading={loadingAction === action.id}
                        onPress={() => action.onPress()}
                    />
                ))}
            </Flex>
            <Flex align="start">
                <Text
                    caption
                    style={styles(theme).sectionTitle}
                    numberOfLines={1}
                    adjustsFontSizeToFit>
                    {t('feature.chat.notification-settings')}
                </Text>
                {notificationActions.map(action => (
                    <ChatRoomAction
                        key={action.id}
                        leftIcon={<SvgImage name={action.icon} />}
                        label={action.label}
                        onPress={() => action.onPress()}
                        disabled={getIsDisabled(action.dataId)}
                        disabledStyle={{ opacity: 0.5 }}
                        isLoading={loadingAction === action.id}
                        rightIcon={
                            action.dataId === notificationMode && (
                                <SvgImage name={'Check'} />
                            )
                        }
                    />
                ))}
            </Flex>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            justifyContent: 'space-evenly',
            alignItems: 'center',
            padding: theme.spacing.lg,
            paddingTop: 0,
        },
        sectionTitle: {
            color: theme.colors.primaryLight,
            paddingVertical: theme.spacing.sm,
        },
    })

export default ChatRoomActions
