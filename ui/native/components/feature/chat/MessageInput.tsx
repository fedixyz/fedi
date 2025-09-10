import { DocumentPickerResponse, types } from '@react-native-documents/picker'
import { useNavigation } from '@react-navigation/native'
import { Input, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ActivityIndicator,
    Insets,
    Keyboard,
    KeyboardEvent,
    LayoutChangeEvent,
    NativeSyntheticEvent,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TextInputContentSizeChangeEventData,
    View,
    Animated,
} from 'react-native'
import { Asset, ImageLibraryOptions } from 'react-native-image-picker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { theme as fediTheme } from '@fedi/common/constants/theme'
import { useToast } from '@fedi/common/hooks/toast'
import { useDebouncedEffect } from '@fedi/common/hooks/util'
import {
    selectChatDrafts,
    selectIsDefaultGroup,
    selectMatrixRoom,
    selectMatrixRoomIsReadOnly,
    selectMessageToEdit,
    setChatDraft,
    setMessageToEdit,
    selectReplyingToMessageEventForRoom,
    clearChatReplyingToMessage,
    selectMatrixRoomMembers,
    selectIsInternetUnreachable,
} from '@fedi/common/redux'
import { InputAttachment, InputMedia } from '@fedi/common/types'
import { makeLog } from '@fedi/common/utils/log'
import {
    getEventId,
    matrixIdToUsername,
    stripReplyFromBody,
} from '@fedi/common/utils/matrix'
import { formatFileSize, prefixFileUri } from '@fedi/common/utils/media'
import { upsertListItem } from '@fedi/common/utils/redux'

import { fedimint } from '../../../bridge'
import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import {
    deriveCopyableFileUri,
    tryPickAssets,
    tryPickDocuments,
    mapMixedMediaToMatrixInput,
} from '../../../utils/media'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'
import { AssetsList } from './AssetsList'
import ChatWalletButton from './ChatWalletButton'

type MessageInputProps = {
    onMessageSubmitted: (
        message: string,
        attachments?: Array<InputAttachment | InputMedia>,
        repliedEventId?: string | null,
    ) => Promise<void>
    id: string
    isSending?: boolean
    isPublic?: boolean
    onHeightChanged?: (height: number) => void
    onReplyBarHeightChanged?: (height: number) => void
}

const log = makeLog('MessageInput')

const imageOptions: ImageLibraryOptions = {
    mediaType: 'mixed',
    maxWidth: 1024,
    maxHeight: 1024,
    quality: 0.7,
    videoQuality: 'low',
    formatAsMp4: true,
    selectionLimit: 10,
}

const MessageInput: React.FC<MessageInputProps> = ({
    onMessageSubmitted,
    id,
    isSending,
    isPublic = true,
    onHeightChanged,
    onReplyBarHeightChanged: onReplyBarHeightChanged,
}: MessageInputProps) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const insets = useSafeAreaInsets()
    const existingRoom = useAppSelector(s => selectMatrixRoom(s, id))
    const navigation = useNavigation()
    const dispatch = useAppDispatch()

    const toast = useToast()
    const isReadOnly = useAppSelector(s => selectMatrixRoomIsReadOnly(s, id))
    const isDefaultGroup = useAppSelector(s => selectIsDefaultGroup(s, id))
    const repliedEvent = useAppSelector(s =>
        selectReplyingToMessageEventForRoom(s, id),
    )
    const roomMembers = useAppSelector(s => selectMatrixRoomMembers(s, id))
    const isOffline = useAppSelector(selectIsInternetUnreachable)

    const drafts = useAppSelector(s => selectChatDrafts(s))
    const [inputHeight, setInputHeight] = useState<number>(
        theme.sizes.minMessageInputHeight,
    )
    const [keyboardHeight, setKeyboardHeight] = useState<number>(0)
    const [messageText, setMessageText] = useState<string>(drafts[id] ?? '')
    const [isSendingMessage, setIsSendingMessage] = useState(false)
    const [replyAnimation] = useState(new Animated.Value(0))

    const directUserId = useMemo(
        () => existingRoom?.directUserId ?? null,
        [existingRoom],
    )
    const inputRef = useRef<TextInput | null>(null)
    const editingMessage = useAppSelector(selectMessageToEdit)

    const isEditingMessage = !!editingMessage
    const inputDisabled = isSending || isReadOnly

    // animate reply bar appearance/disappearance
    useEffect(() => {
        if (repliedEvent && !isEditingMessage && !isReadOnly) {
            Animated.timing(replyAnimation, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
            }).start()

            // notify parent about reply bar height
            if (onReplyBarHeightChanged) {
                onReplyBarHeightChanged(110)
            }
        } else {
            Animated.timing(replyAnimation, {
                toValue: 0,
                duration: 150,
                useNativeDriver: true,
            }).start()

            // reset reply bar height
            if (onReplyBarHeightChanged) {
                onReplyBarHeightChanged(0)
            }
        }
    }, [
        repliedEvent,
        isEditingMessage,
        isReadOnly,
        replyAnimation,
        onReplyBarHeightChanged,
    ])

    useDebouncedEffect(
        () => {
            // don't save drafts when editing a message & ensure we're saving for the correct room
            if (!isEditingMessage) {
                dispatch(setChatDraft({ roomId: id, text: messageText }))
            }
        },
        [messageText, dispatch, isEditingMessage, id],
        500,
    )

    // only update message text when not editing and when room changes
    useEffect(() => {
        if (!isEditingMessage) {
            setMessageText(drafts[id] ?? '')
        }
    }, [id, drafts, isEditingMessage])

    const [documents, setDocuments] = useState<DocumentPickerResponse[]>([])
    const [media, setMedia] = useState<Asset[]>([])
    const [documentsPendingUpload, setDocumentsPendingUpload] = useState<
        DocumentPickerResponse[]
    >([])
    const [isUploadingMedia, setIsUploadingMedia] = useState(false)
    const [isUploadingDocuments, setIsUploadingDocuments] = useState(false)

    const combinedUploads = useMemo(
        () => mapMixedMediaToMatrixInput({ documents, assets: media }),
        [documents, media],
    )

    const handleUploadMedia = useCallback(async () => {
        setIsUploadingMedia(true)
        tryPickAssets(imageOptions, t)
            .match(
                assets => {
                    if (Platform.OS === 'ios') setMedia(m => [...m, ...assets])
                    // On Android, the react-native-image-picker library is breaking the gif animation
                    // somehow when it produces the file URI, so we copy the gif from the original path.
                    // https://github.com/react-native-image-picker/react-native-image-picker/issues/2064#issuecomment-2460501473
                    // TODO: Check if this is fixed upstream (perhaps in the turbo module) and remove this workaround
                    else {
                        setMedia(m => [
                            ...m,
                            ...assets.map(a => {
                                if (
                                    a.originalPath &&
                                    // sometimes animated pics are webp files so we include webp in this workaround
                                    // even though some webp files are not animated and wouldn't be broken
                                    // but using the original path works either way, perhaps a small perf hit
                                    // if rn image-picker is optimizing when producing the file URI
                                    (a.type?.includes('gif') ||
                                        a.type?.includes('webp'))
                                )
                                    return {
                                        ...a,
                                        uri: prefixFileUri(a.originalPath),
                                    }

                                return a
                            }),
                        ])
                    }
                },
                e => {
                    log.error('launchImageLibrary Error: ', e)

                    // Only show a toast if the error is the user's fault
                    if (e._tag === 'UserError') toast.error(t, e)
                },
            )
            .finally(() => {
                setIsUploadingMedia(false)
            })
    }, [t, toast])

    const handleUploadDocument = useCallback(() => {
        setIsUploadingDocuments(true)
        tryPickDocuments(
            {
                // Allow all supported file extensions except for images, audio, and video
                type: [
                    types.csv,
                    types.doc,
                    types.docx,
                    types.pdf,
                    types.plainText,
                    types.ppt,
                    types.pptx,
                    types.xls,
                    types.xlsx,
                    types.zip,
                ],
                allowMultiSelection: true,
                allowVirtualFiles: true,
            },
            t,
        )
            .match(
                async files => {
                    setDocumentsPendingUpload(files)

                    await Promise.all(
                        files.map(file =>
                            deriveCopyableFileUri(file).map(uri => {
                                setDocumentsPendingUpload(pending =>
                                    pending.filter(d => d.uri !== file.uri),
                                )
                                setDocuments(docs => [
                                    ...docs,
                                    { ...file, uri },
                                ])
                            }),
                        ),
                    )
                },
                e => {
                    log.error('DocumentPicker Error: ', e)

                    // Only show a toast if the error is the user's fault
                    if (e._tag === 'UserError') toast.error(t, e)
                },
            )
            .finally(() => {
                setDocumentsPendingUpload([])
                setIsUploadingDocuments(false)
            })
    }, [t, toast])

    const handleEdit = useCallback(async () => {
        if (!isEditingMessage || !messageText || !editingMessage.eventId) return

        try {
            const event = getEventId(editingMessage)
            await fedimint.matrixEditMessage(
                editingMessage.roomId,
                event,
                messageText,
            )
            setMessageText('')
            dispatch(setMessageToEdit(null))
        } catch (e) {
            toast.error(t, e, 'errors.chat-unavailable')
        }
    }, [editingMessage, isEditingMessage, messageText, t, toast, dispatch])

    const trimmedMessageText = messageText
        .trim()
        // Matches three or more whitespace characters, including newlines, tabs, etc
        .replace(/\s{3,}/g, match => match.slice(0, 2))

    useEffect(() => {
        const keyboardShownListener = Keyboard.addListener(
            'keyboardWillShow',
            (e: KeyboardEvent) => {
                setKeyboardHeight(e.endCoordinates.height)
            },
        )
        const keyboardHiddenListener = Keyboard.addListener(
            'keyboardWillHide',
            () => {
                setKeyboardHeight(0)
            },
        )

        return () => {
            keyboardShownListener.remove()
            keyboardHiddenListener.remove()
        }
    }, [])

    // handle edit message: set text if editing current room's message, clear edit state if from different room
    useEffect(() => {
        if (editingMessage) {
            if (editingMessage.roomId === id) {
                setMessageText(editingMessage.content.body)
            } else {
                dispatch(setMessageToEdit(null))
            }
        }
    }, [editingMessage, id, dispatch])

    const handleSend = useCallback(async () => {
        if (
            (!trimmedMessageText && !combinedUploads.length) ||
            isSending ||
            isSendingMessage
        )
            return

        // Validate replied event before sending
        if (repliedEvent) {
            if (!repliedEvent.eventId || isOffline) {
                dispatch(clearChatReplyingToMessage())

                const errorMessage = !repliedEvent.eventId
                    ? t('feature.chat.offline-reply-error-1')
                    : t('feature.chat.offline-reply-error-2')

                toast.error(t, new Error(errorMessage))
                return
            }

            if (repliedEvent.status === 'failed') {
                dispatch(clearChatReplyingToMessage())
                toast.error(t, new Error('Cannot reply to failed message'))
                return
            }
        }

        setIsSendingMessage(true)

        try {
            await onMessageSubmitted(
                trimmedMessageText,
                combinedUploads,
                repliedEvent?.eventId ?? null,
            )
            setMessageText('')
            setMedia([])
            setDocuments([])

            if (repliedEvent) {
                requestAnimationFrame(() => {
                    dispatch(clearChatReplyingToMessage())
                })
            }
        } catch (e) {
            toast.error(t, e, 'errors.chat-unavailable')
        } finally {
            setIsSendingMessage(false)
        }
    }, [
        combinedUploads,
        isSending,
        trimmedMessageText,
        onMessageSubmitted,
        repliedEvent,
        dispatch,
        toast,
        t,
        isSendingMessage,
        isOffline,
    ])

    const style = useMemo(() => styles(theme, insets), [theme, insets])

    const inputStyle = useMemo(() => {
        return isReadOnly ? style.textInputReadonly : style.textInputStyle
    }, [style, isReadOnly])

    const placeholder = useMemo(
        () =>
            isReadOnly
                ? t('feature.chat.broadcast-only-notice')
                : t('phrases.type-message'),
        [isReadOnly, t],
    )

    const handleContentSizeChange = useCallback(
        ({
            nativeEvent: {
                contentSize: { height },
            },
        }: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
            if (height > inputHeight) {
                setInputHeight(
                    Math.min(theme.sizes.maxMessageInputHeight, height),
                )
            } else if (height < inputHeight) {
                setInputHeight(
                    Math.max(theme.sizes.minMessageInputHeight, height),
                )
            }
        },
        [inputHeight, theme],
    )

    const onLayout = (event: LayoutChangeEvent) => {
        if (!onHeightChanged) return
        onHeightChanged(event.nativeEvent.layout.height)
    }

    const repliedEventSenderName = useMemo(() => {
        return (
            roomMembers.find(member => member.id === repliedEvent?.senderId)
                ?.displayName || matrixIdToUsername(repliedEvent?.senderId)
        )
    }, [roomMembers, repliedEvent?.senderId])

    const renderReplyBar = () => {
        if (!repliedEvent || isEditingMessage || isReadOnly) return null

        const sender = repliedEventSenderName

        const bodySnippet = (() => {
            const body = repliedEvent.content.body || 'Message'

            const formattedBody =
                'formatted_body' in repliedEvent.content
                    ? repliedEvent.content.formatted_body
                    : undefined

            const cleanBody = stripReplyFromBody(body, formattedBody)
            return cleanBody.slice(0, 50) || 'Message'
        })()

        return (
            <Animated.View
                style={[
                    style.replyBarContainer,
                    {
                        transform: [
                            {
                                translateY: replyAnimation.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [-5, 0],
                                }),
                            },
                        ],
                        opacity: replyAnimation,
                    },
                ]}>
                <View style={style.replyBar}>
                    <View style={style.replyIndicator} />
                    <View style={style.replyContent}>
                        <Text style={style.replySender} numberOfLines={1}>
                            Replying to {sender}
                        </Text>
                        <Text style={style.replyBody} numberOfLines={1}>
                            {bodySnippet}
                        </Text>
                    </View>

                    <Pressable
                        style={style.replyCloseButton}
                        hitSlop={12}
                        onPress={() => dispatch(clearChatReplyingToMessage())}>
                        <SvgImage
                            name="Close"
                            size={SvgImageSize.xs}
                            color={theme.colors.grey}
                        />
                    </Pressable>
                </View>
            </Animated.View>
        )
    }

    const documentListItems = useMemo(() => {
        let items: Array<{
            id: string
            isLoading: boolean
            document: DocumentPickerResponse
        }> = documents.map(doc => ({
            document: doc,
            isLoading: false,
            id: doc.uri,
        }))

        for (const doc of documentsPendingUpload) {
            items = upsertListItem(items, {
                document: doc,
                isLoading: true,
                id: doc.uri,
            })
        }

        // Sort by fileName to prevent layout shifting
        return items.sort((a, b) =>
            (a.document.name ?? '').localeCompare(b.document.name ?? ''),
        )
    }, [documents, documentsPendingUpload])

    return (
        <View
            onLayout={onLayout}
            style={[
                style.container,
                keyboardHeight > 0 && Platform.OS === 'ios'
                    ? { paddingBottom: keyboardHeight + theme.spacing.lg }
                    : { paddingBottom: theme.spacing.lg + insets.bottom },
                isReadOnly ? { borderTopWidth: 0 } : {},
                // push content up when reply bar is visible
                repliedEvent && !isEditingMessage && !isReadOnly
                    ? { marginTop: -60 }
                    : {},
            ]}>
            {renderReplyBar()}
            {documentListItems.length > 0 && (
                <View style={style.attachmentContainer}>
                    {documentListItems.map(
                        ({ document, isLoading, id: docId }) => (
                            <View
                                key={`doc-pend-${docId}`}
                                style={style.attachment}>
                                <View style={style.attachmentIcon}>
                                    {isLoading ? (
                                        <ActivityIndicator />
                                    ) : (
                                        <SvgImage name="File" />
                                    )}
                                </View>
                                <View style={style.attachmentContent}>
                                    <Text>{document.name}</Text>
                                    <Text style={style.attachmentSize}>
                                        {formatFileSize(document.size ?? 0)}
                                    </Text>
                                </View>
                                {!isLoading && (
                                    <Pressable
                                        style={style.removeButton}
                                        onPress={() =>
                                            setDocuments(prev =>
                                                prev.filter(
                                                    a => a.uri !== document.uri,
                                                ),
                                            )
                                        }>
                                        <SvgImage
                                            name="Close"
                                            size={SvgImageSize.xs}
                                            color={theme.colors.white}
                                        />
                                    </Pressable>
                                )}
                            </View>
                        ),
                    )}
                </View>
            )}
            {media.length > 0 && (
                <AssetsList assets={media} setAttachments={setMedia} />
            )}
            <View style={style.inputContainer}>
                <Input
                    onChangeText={setMessageText}
                    value={messageText}
                    ref={(ref: unknown) => {
                        inputRef.current = ref as TextInput
                    }}
                    placeholder={`${placeholder}`}
                    onContentSizeChange={handleContentSizeChange}
                    containerStyle={[
                        style.textInputOuter,
                        { height: inputHeight },
                    ]}
                    inputContainerStyle={style.textInputInner}
                    inputStyle={inputStyle}
                    multiline
                    numberOfLines={3}
                    blurOnSubmit={false}
                    disabled={inputDisabled}
                />
                {!isReadOnly && !existingRoom && (
                    <Pressable
                        style={style.sendButton}
                        onPress={handleSend}
                        hitSlop={10}
                        disabled={inputDisabled || isSendingMessage}>
                        <SvgImage
                            name="SendArrowUpCircle"
                            size={SvgImageSize.md}
                            color={
                                inputDisabled || isSendingMessage
                                    ? theme.colors.primaryVeryLight
                                    : theme.colors.blue
                            }
                        />
                    </Pressable>
                )}
            </View>
            {existingRoom && (
                <View style={style.buttonContainer}>
                    <View style={style.chatControls}>
                        {/* in-chat payments only available for DirectChat after a room has already been created with the user */}
                        {directUserId && (
                            <ChatWalletButton recipientId={directUserId} />
                        )}
                        {/**
                         * - Polls are available in both public and private chat rooms that the user can post in
                         * - Polls are not available in user-to-user direct chats
                         * - Polls are not available in **default announcment** rooms
                         * */}
                        {!isReadOnly && !directUserId && !isDefaultGroup && (
                            <Pressable
                                onPress={() => {
                                    navigation.navigate('CreatePoll', {
                                        roomId: id,
                                    })
                                }}
                                hitSlop={10}>
                                <SvgImage name="Poll" />
                            </Pressable>
                        )}
                        {/* To prevent users from uploading unencrypted media, media uploads are not available in public chats */}
                        {!isPublic && !isReadOnly && (
                            <>
                                {isUploadingMedia ? (
                                    <ActivityIndicator size={theme.sizes.sm} />
                                ) : (
                                    <Pressable
                                        onPress={handleUploadMedia}
                                        hitSlop={10}>
                                        <SvgImage name="Image" />
                                    </Pressable>
                                )}
                                {isUploadingDocuments ? (
                                    <ActivityIndicator size={theme.sizes.sm} />
                                ) : (
                                    <Pressable
                                        onPress={handleUploadDocument}
                                        hitSlop={10}>
                                        <SvgImage name="Plus" />
                                    </Pressable>
                                )}
                            </>
                        )}
                    </View>
                    {!isReadOnly && (
                        <>
                            {isEditingMessage ? (
                                <View style={style.editButtonsEnd}>
                                    <Pressable
                                        style={style.cancelButton}
                                        onPress={() => {
                                            dispatch(setMessageToEdit(null))
                                            setMessageText('')
                                        }}
                                        hitSlop={10}
                                        disabled={inputDisabled}>
                                        <SvgImage
                                            name="Close"
                                            color={theme.colors.white}
                                        />
                                    </Pressable>
                                    <Pressable
                                        style={style.saveButton}
                                        onPress={handleEdit}
                                        hitSlop={10}
                                        disabled={inputDisabled}>
                                        <SvgImage
                                            name="Check"
                                            color={theme.colors.white}
                                        />
                                    </Pressable>
                                </View>
                            ) : (
                                <Pressable
                                    style={style.sendButton}
                                    onPress={handleSend}
                                    hitSlop={10}
                                    disabled={
                                        inputDisabled || isSendingMessage
                                    }>
                                    <SvgImage
                                        name="SendArrowUpCircle"
                                        size={SvgImageSize.md}
                                        color={
                                            inputDisabled || isSendingMessage
                                                ? theme.colors.primaryVeryLight
                                                : theme.colors.blue
                                        }
                                    />
                                </Pressable>
                            )}
                        </>
                    )}
                </View>
            )}
        </View>
    )
}

const styles = (theme: Theme, insets: Insets) =>
    StyleSheet.create({
        container: {
            width: '100%',
            flexDirection: 'column',
            marginTop: 'auto',
            backgroundColor: theme.colors.secondary,
            borderTopColor: theme.colors.primaryVeryLight,
            borderTopWidth: 1,
            paddingTop: theme.spacing.sm,
            paddingLeft: theme.spacing.md + (insets.left || 0),
            paddingRight: theme.spacing.md + (insets.right || 0),
            paddingBottom: Math.max(theme.spacing.sm, insets.bottom || 0),
            position: 'relative',
            gap: theme.spacing.lg,
        },
        noRoomContainer: {
            paddingBottom: Math.max(theme.spacing.lg, insets.bottom || 0),
        },
        buttonContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
        },
        chatControls: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.lg,
        },
        sendButton: {
            flexShrink: 0,
        },
        textInputInner: {
            borderBottomWidth: 0,
        },
        textInputOuter: {
            borderWidth: 0,
            paddingHorizontal: 0,
            backgroundColor: theme.colors.white,
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: 0,
        },
        textInputStyle: {
            fontSize: fediTheme.fontSizes.body,
        },
        textInputReadonly: {
            color: theme.colors.grey,
            fontSize: fediTheme.fontSizes.body,
            textAlign: 'center',
        },
        attachmentContainer: {
            flexDirection: 'column',
            gap: theme.spacing.sm,
        },
        attachment: {
            padding: theme.spacing.sm,
            borderRadius: 8,
            backgroundColor: theme.colors.offWhite,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
        },
        attachmentIcon: {
            width: 48,
            height: 48,
            padding: theme.spacing.md,
            backgroundColor: theme.colors.extraLightGrey,
            borderRadius: 8,
        },
        attachmentContent: {
            flex: 1,
            flexDirection: 'column',
            display: 'flex',
            gap: theme.spacing.xs,
        },
        attachmentSize: {
            color: theme.colors.darkGrey,
        },
        removeButton: {
            justifyContent: 'center',
            alignItems: 'center',
            position: 'absolute',
            top: 8,
            right: 8,
            width: 16,
            height: 16,
            borderRadius: 16,
            backgroundColor: theme.colors.night,
        },
        inputContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: theme.spacing.lg,
        },
        saveButton: {
            flexShrink: 0,
            width: 24,
            height: 24,
            backgroundColor: theme.colors.blue,
            borderRadius: 24,
            color: theme.colors.white,
            alignItems: 'center',
            justifyContent: 'center',
        },
        cancelButton: {
            flexShrink: 0,
            width: 24,
            height: 24,
            backgroundColor: theme.colors.red,
            borderRadius: 12,
            color: theme.colors.white,
            alignItems: 'center',
            justifyContent: 'center',
        },
        editButtonsEnd: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: theme.spacing.md,
        },
        replyBarContainer: {
            position: 'absolute',
            top: -(59 + 1),
            left: -(theme.spacing.md + (insets.left || 0)),
            right: -(theme.spacing.md + (insets.right || 0)),
            width: 'auto',
            zIndex: 1,
        },
        replyBar: {
            width: '100%',
            height: 59,
            backgroundColor: theme.colors.offWhite100,
            borderTopWidth: 1,
            borderTopColor: theme.colors.lightGrey,
            paddingTop: 12,
            paddingRight: theme.spacing.md + (insets.right || 0) + 16,
            paddingBottom: 12,
            paddingLeft: theme.spacing.md + (insets.left || 0) + 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 16,
        },
        replyIndicator: {
            width: 4,
            height: 35,
            backgroundColor: theme.colors.primary || '#007AFF',
            borderRadius: 2,
            flexShrink: 0,
        },
        replyContent: {
            flex: 1,
            justifyContent: 'center',
        },
        replySender: {
            fontFamily: 'Albert Sans',
            fontWeight: '700',
            fontSize: 14,
            lineHeight: 20,
            letterSpacing: 0,
            color: theme.colors.darkGrey,
            marginBottom: 2,
        },
        replyBody: {
            fontFamily: 'Albert Sans',
            fontSize: 13,
            color: theme.colors.grey || '#6C757D',
            lineHeight: 16,
        },
        replyCloseButton: {
            width: 24,
            height: 24,
            alignItems: 'center',
            justifyContent: 'center',
        },
    })

export default MessageInput
