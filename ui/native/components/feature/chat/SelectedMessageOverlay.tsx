import { CameraRoll } from '@react-native-camera-roll/camera-roll'
import Clipboard from '@react-native-clipboard/clipboard'
import { Text, Theme, useTheme } from '@rneui/themed'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native'
import { TemporaryDirectoryPath, exists } from 'react-native-fs'
import { PermissionStatus, RESULTS } from 'react-native-permissions'
import Share from 'react-native-share'

import { useToast } from '@fedi/common/hooks/toast'
import {
    selectMatrixAuth,
    selectSelectedChatMessage,
    setMessageToEdit,
    setSelectedChatMessage,
} from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'
import { JSONObject } from '@fedi/common/types/bindings'
import { makeLog } from '@fedi/common/utils/log'
import { getEventId, MatrixEventContentType } from '@fedi/common/utils/matrix'

import { fedimint } from '../../../bridge'
import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { useDownloadPermission } from '../../../utils/hooks'
import { pathJoin, prefixFileUri } from '../../../utils/media'
import CustomOverlay from '../../ui/CustomOverlay'
import Flex from '../../ui/Flex'
import { Pressable } from '../../ui/Pressable'
import SvgImage from '../../ui/SvgImage'
import ChatEvent from './ChatEvent'

const log = makeLog('feature/chat/SelectedMessageOverlay')

const SelectedMessageOverlay: React.FC<{ isPublic?: boolean }> = ({
    // Defaults to true so we don't default to loading chat events with media
    isPublic = true,
}) => {
    const [deleteMessage, setDeleteMessage] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [isDownloading, setIsDownloading] = useState(false)
    const selectedMessage = useAppSelector(selectSelectedChatMessage)
    const dispatch = useAppDispatch()
    const { t } = useTranslation()
    const { theme } = useTheme()
    const toast = useToast()
    const matrixAuth = useAppSelector(selectMatrixAuth)
    const { downloadPermission, requestDownloadPermission } =
        useDownloadPermission()

    const isMe = selectedMessage?.senderId === matrixAuth?.userId

    const closeOverlay = useCallback(() => {
        dispatch(setSelectedChatMessage(null))
    }, [dispatch])

    const confirmDeleteMessage = useCallback(async () => {
        if (!selectedMessage || !selectedMessage.eventId) return

        setIsDeleting(true)

        try {
            const event = getEventId(selectedMessage)
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
        if (!selectedMessage || selectedMessage.content.msgtype !== 'm.text')
            return

        dispatch(
            setMessageToEdit(
                selectedMessage as MatrixEvent<
                    MatrixEventContentType<'m.text'>
                >,
            ),
        )

        closeOverlay()
    }, [dispatch, closeOverlay, selectedMessage])

    const handleDownload = useCallback(async () => {
        if (
            !selectedMessage ||
            (selectedMessage.content.msgtype !== 'm.file' &&
                selectedMessage.content.msgtype !== 'm.image' &&
                selectedMessage.content.msgtype !== 'm.video')
        )
            return

        setIsDownloading(true)

        try {
            const path = pathJoin(
                TemporaryDirectoryPath,
                selectedMessage.content.body,
            )

            const downloadedFilePath = await fedimint.matrixDownloadFile(
                path,
                selectedMessage.content as JSONObject,
            )

            const downloadedFileUri = prefixFileUri(downloadedFilePath)

            if (!(await exists(downloadedFilePath))) {
                throw new Error(t('errors.failed-to-download-file'))
            }

            // Downloading files does not require a permissions request
            // since are using the Share.open dialog
            if (selectedMessage.content.msgtype === 'm.file') {
                const filename =
                    Platform.OS === 'android'
                        ? selectedMessage.content.body.replace(/\.[a-z]+$/, '')
                        : selectedMessage.content.body

                try {
                    await Share.open({
                        filename,
                        type: selectedMessage.content.info.mimetype,
                        url: downloadedFileUri,
                    })

                    toast.show({
                        content: t('feature.chat.file-saved'),
                        status: 'success',
                    })
                } catch {
                    /* no-op*/
                }
            } else {
                // Downloading images and videos requires permissions
                let permissionStatus: PermissionStatus | undefined =
                    downloadPermission

                if (permissionStatus !== RESULTS.GRANTED)
                    permissionStatus = await requestDownloadPermission()

                if (permissionStatus === RESULTS.GRANTED) {
                    await CameraRoll.saveAsset(downloadedFileUri, {
                        type: 'auto',
                    })
                } else {
                    throw new Error(t('errors.please-grant-permission'))
                }

                // Customize the message by OS:
                // - iOS saves both pictures and videos to the photos library
                // - Android saves videos and photos in different folders
                let message = t('feature.chat.saved-to-photo-library')
                if (Platform.OS === 'android') {
                    message =
                        selectedMessage.content.msgtype === 'm.video'
                            ? t('feature.chat.saved-to-movies')
                            : t('feature.chat.saved-to-pictures')
                }

                toast.show({
                    content: message,
                    status: 'success',
                })
            }
        } catch (err) {
            toast.error(t, err, 'errors.unknown-error')
            log.error('failed to save file', err)
        } finally {
            setIsDownloading(false)
            closeOverlay()
        }
    }, [
        selectedMessage,
        t,
        toast,
        closeOverlay,
        requestDownloadPermission,
        downloadPermission,
    ])

    useEffect(() => {
        setDeleteMessage(false)
    }, [selectedMessage])

    const style = styles(theme)

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
                                    event={
                                        selectedMessage as MatrixEvent<
                                            MatrixEventContentType<
                                                | 'm.text'
                                                | 'm.image'
                                                | 'm.video'
                                                | 'm.file'
                                            >
                                        >
                                    }
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
