import Clipboard from '@react-native-clipboard/clipboard'
import { Text, Theme, useTheme } from '@rneui/themed'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import {
    selectMatrixAuth,
    selectSelectedChatMessage,
    setMessageToEdit,
    setSelectedChatMessage,
    setChatReplyingToMessage,
} from '@fedi/common/redux'
import {
    isFileEvent,
    isImageEvent,
    isTextEvent,
    isVideoEvent,
} from '@fedi/common/utils/matrix'

import { fedimint } from '../../../bridge'
import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { useDownloadResource } from '../../../utils/hooks/media'
import CustomOverlay from '../../ui/CustomOverlay'
import Flex from '../../ui/Flex'
import { Pressable } from '../../ui/Pressable'
import SvgImage from '../../ui/SvgImage'
import ChatEvent from './ChatEvent'

const SelectedMessageOverlay: React.FC<{ isPublic?: boolean }> = ({
    // Defaults to true so we don't default to loading chat events with media
    isPublic = true,
}) => {
    const [deleteMessage, setDeleteMessage] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
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

    const confirmDeleteMessage = useCallback(async () => {
        if (!selectedMessage || !selectedMessage.id) return

        setIsDeleting(true)

        try {
            const event = selectedMessage.id
            await fedimint.matrixDeleteMessage(
                selectedMessage.roomId,
                event,
                null,
            )

            closeOverlay()
        } catch (e) {
            toast.error(t, e, 'errors.unknown-error')
        } finally {
            setIsDeleting(false)
        }
    }, [t, toast, closeOverlay, selectedMessage])

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

    useEffect(() => {
        setDeleteMessage(false)
    }, [selectedMessage])

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
                    deleteMessage && selectedMessage ? (
                        <Flex
                            align="center"
                            gap="xl"
                            style={style.confirmDeleteContainer}>
                            <Flex
                                row
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
                            </Flex>
                            <Text medium>
                                {t('feature.chat.confirm-delete-message')}
                            </Text>
                        </Flex>
                    ) : (
                        <Flex fullWidth>
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
                            {isMe && (
                                <Pressable
                                    onPress={() => setDeleteMessage(true)}
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
                        </Flex>
                    ),
                buttons: deleteMessage
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
