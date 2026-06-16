import Clipboard from '@react-native-clipboard/clipboard'
import { Text, Theme, useTheme } from '@rneui/themed'
import type { ResourceKey } from 'i18next'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import {
    MATRIX_QUICK_REACTION_EMOJIS,
    MAX_CHAT_REACTION_EMOJIS,
} from '@fedi/common/constants/matrix'
import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import {
    selectSelectedChatMessage,
    setMessageToEdit,
    setSelectedChatMessage,
    setChatReplyingToMessage,
    selectMessageReactionsEnabled,
    toggleMatrixReaction,
} from '@fedi/common/redux'
import {
    canAddMatrixReaction,
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
import { MatrixReactionEmojiPicker } from './MatrixReactionEmojiPicker'
import { useMessageActionState } from './useMessageActionState'

const SelectedMessageOverlay: React.FC<{ isPublic?: boolean }> = ({
    // Defaults to true so we don't default to loading chat events with media
    isPublic = true,
}) => {
    const selectedMessage = useAppSelector(selectSelectedChatMessage)
    const dispatch = useAppDispatch()
    const { t } = useTranslation()
    const { theme } = useTheme()
    const toast = useToast()
    const fedimint = useFedimint()
    const messageReactionsEnabled = useAppSelector(
        selectMessageReactionsEnabled,
    )
    const [reactingEmoji, setReactingEmoji] = useState<string | null>(null)
    const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false)

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

    const closeOverlay = useCallback(() => {
        setIsEmojiPickerOpen(false)
        dispatch(setSelectedChatMessage(null))
    }, [dispatch])

    const {
        canReply,
        canCopy,
        canEdit,
        canDownload,
        canReact,
        canDelete,
        isDeleting,
        showDeleteConfirm,
        setShowDeleteConfirm,
        confirmDeleteMessage,
        canPin,
        isPinned,
        isPinning,
        pinMessage,
        unpinMessage,
    } = useMessageActionState({
        t,
        message: selectedMessage,
        onSuccess: closeOverlay,
    })

    const handlePinToggle = useCallback(async () => {
        if (isPinned) {
            await unpinMessage()
        } else {
            await pinMessage()
        }
    }, [isPinned, pinMessage, unpinMessage])

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

    const handleReaction = useCallback(
        async (reactionKey: string) => {
            if (
                !messageReactionsEnabled ||
                !selectedMessage ||
                reactingEmoji ||
                !canAddMatrixReaction(selectedMessage, reactionKey)
            )
                return

            setReactingEmoji(reactionKey)
            try {
                await dispatch(
                    toggleMatrixReaction({
                        fedimint,
                        roomId: selectedMessage.roomId,
                        eventId: selectedMessage.id,
                        reactionKey,
                    }),
                ).unwrap()
                closeOverlay()
            } catch (e) {
                toast.error(t, e, 'errors.unknown-error')
            } finally {
                setReactingEmoji(null)
            }
        },
        [
            closeOverlay,
            dispatch,
            fedimint,
            messageReactionsEnabled,
            reactingEmoji,
            selectedMessage,
            t,
            toast,
        ],
    )

    const style = styles(theme)
    const reactLabel = t('words.react' as ResourceKey)
    const canShowReactions = messageReactionsEnabled && canReact
    const hasAnyVisibleAction =
        canShowReactions ||
        canReply ||
        canCopy ||
        canPin ||
        canDownload ||
        canDelete
    const canSelectReaction = useCallback(
        (reactionKey: string) => {
            if (!selectedMessage) return false

            const reactions = selectedMessage.reactions ?? []

            return (
                reactions.some(reaction => reaction.key === reactionKey) ||
                reactions.length < MAX_CHAT_REACTION_EMOJIS
            )
        },
        [selectedMessage],
    )

    return (
        <CustomOverlay
            onBackdropPress={closeOverlay}
            show={!!selectedMessage && hasAnyVisibleAction}
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
                    ) : messageReactionsEnabled &&
                      isEmojiPickerOpen &&
                      selectedMessage ? (
                        <MatrixReactionEmojiPicker
                            event={selectedMessage}
                            pendingReaction={reactingEmoji}
                            onSelect={handleReaction}
                        />
                    ) : (
                        <Column fullWidth>
                            {canShowReactions && selectedMessage && (
                                <Column
                                    gap="sm"
                                    fullWidth
                                    style={style.quickReactionsContainer}>
                                    <Text bold>{reactLabel}</Text>
                                    <Row gap="sm" fullWidth>
                                        {MATRIX_QUICK_REACTION_EMOJIS.map(
                                            reactionKey => {
                                                const disabled =
                                                    !!reactingEmoji ||
                                                    !canSelectReaction(
                                                        reactionKey,
                                                    )

                                                return (
                                                    <Pressable
                                                        key={reactionKey}
                                                        accessibilityRole="button"
                                                        accessibilityLabel={`${reactLabel} ${reactionKey}`}
                                                        disabled={disabled}
                                                        onPress={() =>
                                                            handleReaction(
                                                                reactionKey,
                                                            )
                                                        }
                                                        containerStyle={
                                                            style.quickReaction
                                                        }>
                                                        {reactingEmoji ===
                                                        reactionKey ? (
                                                            <ActivityIndicator size="small" />
                                                        ) : (
                                                            <Text
                                                                style={
                                                                    style.quickReactionEmoji
                                                                }>
                                                                {reactionKey}
                                                            </Text>
                                                        )}
                                                    </Pressable>
                                                )
                                            },
                                        )}
                                        <Pressable
                                            accessibilityRole="button"
                                            accessibilityLabel="more reactions"
                                            disabled={!!reactingEmoji}
                                            onPress={() =>
                                                setIsEmojiPickerOpen(true)
                                            }
                                            containerStyle={
                                                style.quickReaction
                                            }>
                                            <SvgImage
                                                name="Plus"
                                                size={16}
                                                color={theme.colors.darkGrey}
                                            />
                                        </Pressable>
                                    </Row>
                                </Column>
                            )}
                            {canReply && (
                                <Pressable
                                    testID="SelectedMessageOverlayReply"
                                    onPress={handleReply}
                                    containerStyle={style.action}>
                                    <SvgImage name="ArrowCornerUpLeftDouble" />
                                    <Text bold>{t('words.reply')}</Text>
                                </Pressable>
                            )}

                            {canCopy && (
                                <>
                                    <Pressable
                                        onPress={handleCopy}
                                        containerStyle={style.action}>
                                        <SvgImage name="Copy" />
                                        <Text bold>
                                            {t('phrases.copy-text')}
                                        </Text>
                                    </Pressable>
                                    {canEdit && (
                                        <Pressable
                                            onPress={handleEdit}
                                            containerStyle={style.action}>
                                            <SvgImage name="Edit" />
                                            <Text bold>{t('words.edit')}</Text>
                                        </Pressable>
                                    )}
                                </>
                            )}
                            {canPin && (
                                <Pressable
                                    onPress={handlePinToggle}
                                    containerStyle={style.action}
                                    disabled={isPinning}>
                                    {isPinning ? (
                                        <ActivityIndicator />
                                    ) : (
                                        <SvgImage
                                            name={
                                                isPinned ? 'Pin' : 'PinFilled'
                                            }
                                        />
                                    )}
                                    <Text bold>
                                        {isPinned
                                            ? t('feature.chat.unpin-message')
                                            : t('feature.chat.pin-message')}
                                    </Text>
                                </Pressable>
                            )}
                            {canDownload && (
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
        quickReactionsContainer: {
            paddingHorizontal: theme.spacing.sm,
            paddingBottom: theme.spacing.md,
        },
        quickReaction: {
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 32,
            width: 'auto',
            paddingHorizontal: theme.spacing.xxs,
            paddingVertical: theme.spacing.xs,
        },
        quickReactionEmoji: {
            fontSize: 24,
            lineHeight: 32,
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
