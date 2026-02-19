import Clipboard from '@react-native-clipboard/clipboard'
import { Text, Theme, useTheme } from '@rneui/themed'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { useDeleteMessage } from '@fedi/common/hooks/matrix'
import { useToast } from '@fedi/common/hooks/toast'
import {
    selectSelectedChatMessage,
    setMessageToEdit,
    setSelectedChatMessage,
    setChatReplyingToMessage,
    selectMatrixAuth,
} from '@fedi/common/redux'
import {
    isFileEvent,
    isImageEvent,
    isTextEvent,
    isVideoEvent,
} from '@fedi/common/utils/matrix'

import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { useDownloadResource } from '../../../utils/hooks/media'
import CustomOverlay from '../../ui/CustomOverlay'
import { Row, Column } from '../../ui/Flex'
import { Pressable } from '../../ui/Pressable'
import SvgImage from '../../ui/SvgImage'
import ChatEvent from './ChatEvent'

const SelectedMessageOverlay: React.FC<{ isPublic?: boolean }> = ({
    // Defaults to true so we don't default to loading chat events with media
    isPublic = true,
}) => {
    const selectedMessage = useAppSelector(selectSelectedChatMessage)
    const dispatch = useAppDispatch()
    const { t } = useTranslation()
    const { theme } = useTheme()
    const toast = useToast()
    const matrixAuth = useAppSelector(selectMatrixAuth)

    const downloadResource =
        selectedMessage &&
        (isFileEvent(selectedMessage) ||
            isImageEvent(selectedMessage) ||
            isVideoEvent(selectedMessage))
            ? selectedMessage
            : null

    const { handleDownload: handleDownloadFile, isDownloading } =
        useDownloadResource(downloadResource, {
            loadResourceInitially: false,
        })

    const isMe = selectedMessage?.sender === matrixAuth?.userId

    const closeOverlay = useCallback(() => {
        dispatch(setSelectedChatMessage(null))
    }, [dispatch])

    const {
        canDelete,
        isDeleting,
        showDeleteConfirm,
        setShowDeleteConfirm,
        confirmDeleteMessage,
    } = useDeleteMessage({
        t,
        roomId: selectedMessage?.roomId ?? '',
        senderId: selectedMessage?.sender ?? '',
        eventId: selectedMessage?.id,
        onSuccess: closeOverlay,
    })

    const handleCopy = useCallback(() => {
        if (!selectedMessage || selectedMessage.content.msgtype !== 'm.text')
            return

        Clipboard.setString(selectedMessage.content.body)
        closeOverlay()
        toast.show({
            content: t('phrases.copied-to-clipboard'),
            status: 'success',
        })
    }, [t, toast, closeOverlay, selectedMessage])

    const handleEdit = useCallback(() => {
        if (!selectedMessage) return
        if (!isTextEvent(selectedMessage)) return

        dispatch(setMessageToEdit(selectedMessage))

        closeOverlay()
    }, [dispatch, closeOverlay, selectedMessage])

    const handleDownload = useCallback(async () => {
        if (!selectedMessage) return

        await handleDownloadFile()
        closeOverlay()
    }, [closeOverlay, handleDownloadFile, selectedMessage])

    const handleReply = useCallback(() => {
        if (!selectedMessage) return

        dispatch(
            setChatReplyingToMessage({
                roomId: selectedMessage.roomId,
                event: selectedMessage,
            }),
        )
        closeOverlay()
    }, [dispatch, closeOverlay, selectedMessage])

    const style = styles(theme)

    const canReply =
        !!selectedMessage &&
        (['m.text', 'm.notice', 'm.emote'].includes(
            selectedMessage.content.msgtype,
        ) ||
            isImageEvent(selectedMessage) ||
            isVideoEvent(selectedMessage) ||
            isFileEvent(selectedMessage))

    return (
        <CustomOverlay
            onBackdropPress={closeOverlay}
            show={!!selectedMessage}
            contents={{
                body:
                    showDeleteConfirm && selectedMessage ? (
                        <Column
                            align="center"
                            gap="xl"
                            style={style.confirmDeleteContainer}>
                            <Row
                                align="start"
                                justify="center"
                                style={style.previewMessageContainer}>
                                <ChatEvent
                                    event={selectedMessage}
                                    last
                                    fullWidth={false}
                                    isPublic={isPublic}
                                />
                                {/* prevent user from interacting with the chat event */}
                                <View style={style.previewMessageOverlay} />
                            </Row>
                            <Text medium>
                                {t('feature.chat.confirm-delete-message')}
                            </Text>
                        </Column>
                    ) : (
                        <Column fullWidth>
                            {canReply && (
                                <Pressable
                                    onPress={handleReply}
                                    containerStyle={style.action}>
                                    <SvgImage name="ArrowCornerUpLeftDouble" />
                                    <Text bold>{t('words.reply')}</Text>
                                </Pressable>
                            )}

                            {selectedMessage?.content.msgtype === 'm.text' && (
                                <>
                                    <Pressable
                                        onPress={handleCopy}
                                        containerStyle={style.action}>
                                        <SvgImage name="Copy" />
                                        <Text bold>
                                            {t('phrases.copy-text')}
                                        </Text>
                                    </Pressable>
                                    {isMe && (
                                        <Pressable
                                            onPress={handleEdit}
                                            containerStyle={style.action}>
                                            <SvgImage name="Edit" />
                                            <Text bold>{t('words.edit')}</Text>
                                        </Pressable>
                                    )}
                                </>
                            )}
                            {(selectedMessage?.content.msgtype === 'm.image' ||
                                selectedMessage?.content.msgtype ===
                                    'm.video' ||
                                selectedMessage?.content.msgtype ===
                                    'm.file') && (
                                <Pressable
                                    onPress={handleDownload}
                                    containerStyle={style.action}>
                                    {isDownloading ? (
                                        <ActivityIndicator />
                                    ) : (
                                        <SvgImage name="Download" />
                                    )}
                                    <Text bold>{t('words.download')}</Text>
                                </Pressable>
                            )}
                            {canDelete && (
                                <Pressable
                                    onPress={() => setShowDeleteConfirm(true)}
                                    containerStyle={style.action}>
                                    <SvgImage
                                        color={theme.colors.red}
                                        name="Trash"
                                    />
                                    <Text bold color={theme.colors.red}>
                                        {t('words.delete')}
                                    </Text>
                                </Pressable>
                            )}
                        </Column>
                    ),
                buttons: showDeleteConfirm
                    ? [
                          {
                              text: t('words.cancel'),
                              onPress: closeOverlay,
                          },
                          {
                              primary: true,
                              text: t('words.delete'),
                              onPress: confirmDeleteMessage,
                              disabled: isDeleting,
                          },
                      ]
                    : undefined,
            }}
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        action: {
            gap: theme.spacing.lg,
        },
        messageBubble: {
            padding: 10,
            backgroundColor: theme.colors.blue,
            maxWidth: theme.sizes.maxMessageWidth,
            overflow: 'hidden',
        },
        previewMessageContainer: {
            borderRadius: 16,
            borderBottomRightRadius: 4,
            overflow: 'hidden',
            maxWidth: theme.sizes.maxMessageWidth,
        },
        outgoingText: {
            color: theme.colors.secondary,
        },
        confirmDeleteContainer: {
            paddingVertical: theme.spacing.lg,
        },
        previewMessageOverlay: {
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 1,
        },
    })

export default SelectedMessageOverlay
