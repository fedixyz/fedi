import { DocumentPickerResponse, types } from '@react-native-documents/picker'
import { useNavigation } from '@react-navigation/native'
import { Input, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ActivityIndicator,
    Insets,
    LayoutChangeEvent,
    NativeSyntheticEvent,
    Platform,
    Pressable,
    StyleSheet,
    TextInput,
    TextInputContentSizeChangeEventData,
    TextInputSelectionChangeEventData,
    View,
    Animated,
    Dimensions,
} from 'react-native'
import { Asset, ImageLibraryOptions } from 'react-native-image-picker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
    GUARDIANITO_BOT_DISPLAY_NAME,
    ROOM_MENTION,
} from '@fedi/common/constants/matrix'
import { theme as fediTheme } from '@fedi/common/constants/theme'
import { useMentionInput } from '@fedi/common/hooks/matrix'
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
    editMatrixMessage,
    selectMatrixAuth,
} from '@fedi/common/redux'
import {
    InputAttachment,
    InputMedia,
    MatrixRoomMember,
    MentionSelect,
} from '@fedi/common/types'
import { RpcMatrixMembership } from '@fedi/common/types/bindings'
import { makeLog } from '@fedi/common/utils/log'
import {
    matrixIdToUsername,
    stripReplyFromBody,
} from '@fedi/common/utils/matrix'
import { formatFileSize, prefixFileUri } from '@fedi/common/utils/media'
import { upsertListItem } from '@fedi/common/utils/redux'

import { fedimint } from '../../../bridge'
import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { useKeyboard } from '../../../utils/hooks/keyboard'
import {
    deriveCopyableFileUri,
    tryPickAssets,
    tryPickDocuments,
    mapMixedMediaToMatrixInput,
} from '../../../utils/media'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'
import { AssetsList } from './AssetsList'
import ChatMentionSuggestions from './ChatMentionSuggestions'
import ChatWalletButton from './ChatWalletButton'

type MessageInputProps = {
    onMessageSubmitted: (
        message: string,
        attachments?: Array<InputAttachment | InputMedia>,
        repliedEventId?: string,
    ) => Promise<void>
    id: string
    isSending?: boolean
    isPublic?: boolean
    onHeightChanged?: (height: number) => void
    onReplyBarHeightChanged?: (height: number) => void
}

const log = makeLog('MessageInput')
const SUGGESTIONS_MIN_HEIGHT = 120
const CARET_LOCK_MS = 450
const CARET_LOCK_MS_EMOJI = 900

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
    const isGuardianitoRoom =
        existingRoom?.name === GUARDIANITO_BOT_DISPLAY_NAME
    const repliedEvent = useAppSelector(s =>
        selectReplyingToMessageEventForRoom(s, id),
    )
    const roomMembers = useAppSelector(s => selectMatrixRoomMembers(s, id))
    // const isOffline = useAppSelector(selectIsInternetUnreachable)
    const auth = useAppSelector(selectMatrixAuth)
    const selfUserId = auth?.userId || undefined

    const drafts = useAppSelector(s => selectChatDrafts(s))

    const { isVisible: kbVisible, height: kbHeight } = useKeyboard()
    const [isFocused, setIsFocused] = useState(false)
    const [messageText, setMessageText] = useState<string>(drafts[id] ?? '')
    const [isSendingMessage, setIsSendingMessage] = useState(false)

    // caret tracking (works around late selection events on older Androids)
    const lastCaretRef = useRef(0)
    const lastValueRef = useRef(messageText)
    const ignoreSelUntilRef = useRef(0)

    const [selectionStart, setSelectionStart] = useState(0)
    const forcedSelection: number | null = null
    const directUserId = useMemo(
        () => existingRoom?.directUserId ?? null,
        [existingRoom],
    )
    const mentionEnabled = useMemo(
        () => !(!!directUserId || (!existingRoom && !isPublic)),
        [directUserId, existingRoom, isPublic],
    )
    const [forceHideSuggestions, setForceHideSuggestions] = useState(false)

    // Build candidates for the mention hook, injecting "self" if missing so we can self-mention by display name.
    const membersForMentions: MatrixRoomMember[] = useMemo(() => {
        if (!mentionEnabled) return []
        const list: MatrixRoomMember[] = (roomMembers ||
            []) as MatrixRoomMember[]
        const hasSelf = !!(selfUserId && list.some(m => m.id === selfUserId))
        if (hasSelf || !selfUserId) return list
        const displayName =
            (auth?.displayName || '').trim() || matrixIdToUsername(selfUserId)
        const selfAsMember: MatrixRoomMember = {
            id: selfUserId,
            displayName,
            avatarUrl: undefined,
            powerLevel: { type: 'int', value: 0 },
            roomId: id,
            membership: 'join' as RpcMatrixMembership,
            ignored: false,
        }
        return [...list, selfAsMember]
    }, [mentionEnabled, roomMembers, selfUserId, auth?.displayName, id])

    const { mentionSuggestions, shouldShowSuggestions, detectMentionTrigger } =
        useMentionInput(membersForMentions, selectionStart)

    const MIN_INPUT_H = theme.sizes.minMessageInputHeight
    const [inputHeight, setInputHeight] = useState<number>(MIN_INPUT_H)

    const inputRef = useRef<TextInput | null>(null)
    const editingMessage = useAppSelector(selectMessageToEdit)

    const isEditingMessage = !!editingMessage
    const inputDisabled = isSending || isReadOnly

    const replyOpacity = useRef(new Animated.Value(0)).current
    // animate reply bar appearance/disappearance
    useEffect(() => {
        const visible = !!(repliedEvent && !isEditingMessage && !isReadOnly)
        const anim = Animated.timing(replyOpacity, {
            toValue: visible ? 1 : 0,
            duration: visible ? 200 : 150,
            useNativeDriver: true,
        })
        anim.start()
        return () => anim.stop()
    }, [repliedEvent, isEditingMessage, isReadOnly, replyOpacity])

    useEffect(() => {
        onReplyBarHeightChanged?.(0)
    }, [onReplyBarHeightChanged])

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

    const suggestionsMaxHeight = useMemo(() => {
        const winH = Dimensions.get('window').height
        const headerApprox = 56
        const gapAboveInput = 9
        const keyboard = kbVisible ? kbHeight : 0
        // space between header+safe top and the top of the input row
        const available =
            winH -
            keyboard -
            inputHeight -
            (insets.top || 0) -
            headerApprox -
            gapAboveInput
        return Math.max(SUGGESTIONS_MIN_HEIGHT, Math.floor(available))
    }, [kbVisible, kbHeight, inputHeight, insets.top])

    const suggestionsTopSpacer = useMemo(() => {
        const headerApprox = 56
        return (insets.top || 0) + headerApprox
    }, [insets.top])

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
        if (!isEditingMessage || !messageText || !editingMessage.id) return

        try {
            // const event = editingMessage.id
            // await fedimint.matrixEditMessage(
            //     editingMessage.roomId,
            //     event,
            //     messageText,
            // )
            await dispatch(
                editMatrixMessage({
                    fedimint,
                    roomId: editingMessage.roomId,
                    eventId: editingMessage.id,
                    body: messageText,
                }),
            ).unwrap()
            setMessageText('')
            dispatch(setMessageToEdit(null))
        } catch (e) {
            toast.error(t, e, 'errors.chat-unavailable')
        }
    }, [dispatch, editingMessage, isEditingMessage, messageText, t, toast])

    const trimmedMessageText = messageText
        .trim()
        // Matches three or more whitespace characters, including newlines, tabs, etc
        .replace(/\s{3,}/g, match => match.slice(0, 2))

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

        // This logic is bugged due to the event being stale since it can't receive updates
        // TODO: Only save the id of the replied event, then select the event when trying to send the message

        // if (repliedEvent) {
        //     if (repliedEvent.localEcho || isOffline) {
        //         console.warn(
        //             'clearChatReplyingToMessage',
        //             repliedEvent,
        //             isOffline,
        //         )
        //         dispatch(clearChatReplyingToMessage())

        //         const errorMessage = repliedEvent.localEcho
        //             ? t('feature.chat.offline-reply-error-1')
        //             : t('feature.chat.offline-reply-error-2')

        //         toast.error(t, new Error(errorMessage))
        //         return
        //     }

        //     if (repliedEvent.sendState?.kind === 'sendingFailed') {
        //         dispatch(clearChatReplyingToMessage())
        //         toast.error(t, new Error('Cannot reply to failed message'))
        //         return
        //     }
        // }

        setIsSendingMessage(true)

        try {
            await onMessageSubmitted(
                trimmedMessageText,
                combinedUploads,
                repliedEvent?.id,
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
        (e: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
            const { height } = e.nativeEvent.contentSize
            const EXTRA = 8
            const next = Math.min(
                theme.sizes.maxMessageInputHeight,
                Math.max(MIN_INPUT_H, Math.ceil(height) + EXTRA),
            )
            if (next !== inputHeight) setInputHeight(next)
        },
        [inputHeight, theme, MIN_INPUT_H],
    )

    const onLayout = (event: LayoutChangeEvent) => {
        if (!onHeightChanged) return
        onHeightChanged(event.nativeEvent.layout.height)
    }

    const repliedEventSenderName = useMemo(() => {
        return (
            roomMembers.find(member => member.id === repliedEvent?.sender)
                ?.displayName || matrixIdToUsername(repliedEvent?.sender)
        )
    }, [roomMembers, repliedEvent?.sender])

    const renderReplyBar = () => {
        if (!repliedEvent || isEditingMessage || isReadOnly) return null

        const sender = repliedEventSenderName

        const bodySnippet = (() => {
            const body =
                'body' in repliedEvent.content
                    ? repliedEvent.content.body
                    : 'Message'

            const formattedBody =
                'formatted' in repliedEvent.content
                    ? repliedEvent.content.formatted?.formattedBody
                    : undefined

            const cleanBody = stripReplyFromBody(body, formattedBody)
            return cleanBody.slice(0, 50) || 'Message'
        })()

        return (
            <Animated.View
                style={[style.replyBarContainer, { opacity: replyOpacity }]}>
                <View style={style.replyBar}>
                    <View style={style.replyIndicator} />
                    <View style={style.replyContent}>
                        <Text
                            style={style.replySender}
                            numberOfLines={1}
                            maxFontSizeMultiplier={
                                theme.multipliers?.headerMaxFontMultiplier ??
                                1.3
                            }>
                            {/* TODO: make local for this */}
                            Replying to {sender}
                        </Text>
                        <Text
                            style={style.replyBody}
                            numberOfLines={1}
                            maxFontSizeMultiplier={
                                theme.multipliers?.bodyMaxFontMultiplier ??
                                theme.multipliers?.headerMaxFontMultiplier ??
                                1.3
                            }>
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

    const renderHelpCommand = () => {
        return (
            <View style={style.guardianitoHelpTextContainer}>
                <Text small style={style.guardianitoHelpText}>
                    {t('feature.chat.guardianito-help-text')}
                </Text>
            </View>
        )
    }

    const handleSelectionChange = useCallback(
        (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
            if (forcedSelection !== null) return
            const sel = e.nativeEvent.selection
            const s = Math.max(sel.start, sel.end)
            // During lock, snap back immediately on backward selection regressions.
            if (
                Date.now() < ignoreSelUntilRef.current &&
                s < lastCaretRef.current
            ) {
                inputRef.current?.setNativeProps?.({
                    selection: {
                        start: lastCaretRef.current,
                        end: lastCaretRef.current,
                    },
                })
                return
            }
            setSelectionStart(s)
            lastCaretRef.current = s
            if (mentionEnabled) {
                detectMentionTrigger(messageText, s)
            }
        },
        [detectMentionTrigger, messageText, mentionEnabled, forcedSelection],
    )

    const onChangeText = useCallback(
        (value: string) => {
            // compute a robust caret guess based on last confirmed caret and length delta.
            const prev = lastValueRef.current
            const delta = value.length - prev.length
            const guess = Math.max(
                0,
                Math.min(lastCaretRef.current + delta, value.length),
            )
            setMessageText(value)
            lastValueRef.current = value
            if (mentionEnabled) {
                detectMentionTrigger(value, guess === 0 ? value.length : guess)
            }
        },
        [detectMentionTrigger, mentionEnabled],
    )

    const insertMention = useCallback(
        (item: MentionSelect) => {
            const text = messageText
            const cursor = selectionStart

            const label =
                item.id === '@room'
                    ? `@${ROOM_MENTION}`
                    : `@${(item.displayName || matrixIdToUsername(item.id)).trim()}`
            const insertion = `${label} `

            // fix for Android 9 and under 'caret doesn't move to end of line' Git Issue 8843
            // target the token immediately before the caret
            const left = text.slice(0, cursor)
            // matches an @-mention immediately before the cursor: start/space + '@' + the current handle fragment, anchored to the end.
            const match = left.match(/(^|\s)@([^\s\r\n]*)$/)
            const start = match
                ? cursor - ((match[2]?.length ?? 0) + 1)
                : cursor

            const before = text.slice(0, start)
            const after = text.slice(cursor)
            const newText = before + insertion + after
            const nextCursor = before.length + insertion.length

            setMessageText(newText)
            lastValueRef.current = newText
            setSelectionStart(nextCursor)
            lastCaretRef.current = nextCursor

            // ZWJ or VS, any pictographic emoji, skin-tone modifiers, or regional indicators
            const EMOJIISH_RE =
                /(?:\u200D|\uFE0F|\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator})/u

            const emojiish = EMOJIISH_RE.test(insertion)
            ignoreSelUntilRef.current =
                Date.now() + (emojiish ? CARET_LOCK_MS_EMOJI : CARET_LOCK_MS)

            setForceHideSuggestions(true)
            // send a "no active token" signal — most hooks treat a negative index as "clear"
            detectMentionTrigger(newText, -1)

            requestAnimationFrame(() => {
                inputRef.current?.setNativeProps?.({
                    selection: { start: nextCursor, end: nextCursor },
                })
                lastCaretRef.current = nextCursor
                setForceHideSuggestions(false)
            })
            // Some keyboards apply emoji presentation in a second pass.
            // Re-assert the caret a couple of times if emoji was present.
            if (emojiish) {
                ;[48, 160].forEach(ms =>
                    setTimeout(() => {
                        inputRef.current?.setNativeProps?.({
                            selection: {
                                start: lastCaretRef.current,
                                end: lastCaretRef.current,
                            },
                        })
                    }, ms),
                )
            }
            //end of bugfix
        },
        [messageText, selectionStart, detectMentionTrigger],
    )

    const showMentionSuggestions =
        !isReadOnly &&
        !isEditingMessage &&
        mentionEnabled &&
        shouldShowSuggestions

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
                Platform.OS === 'ios' && kbVisible && isFocused
                    ? { paddingBottom: kbHeight + theme.spacing.sm }
                    : {
                          paddingBottom: Math.max(
                              theme.spacing.sm,
                              insets.bottom || 0,
                          ),
                      },
                isReadOnly ? { borderTopWidth: 0 } : {},
            ]}>
            {renderReplyBar()}
            {isGuardianitoRoom && renderHelpCommand()}
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

            {/* input row */}
            <View style={style.inputContainer}>
                {showMentionSuggestions && !forceHideSuggestions && (
                    <View pointerEvents="auto" style={style.mentionOverlay}>
                        <ChatMentionSuggestions
                            visible
                            suggestions={mentionSuggestions}
                            onSelect={insertMention}
                            maxHeight={suggestionsMaxHeight}
                            topSpacer={suggestionsTopSpacer}
                        />
                    </View>
                )}

                <View
                    style={[
                        style.inputFieldWrapper,
                        { minHeight: inputHeight },
                    ]}>
                    <Input
                        disableFullscreenUI
                        textBreakStrategy="simple"
                        onChangeText={onChangeText}
                        onSelectionChange={handleSelectionChange}
                        value={messageText}
                        ref={(ref: TextInput | null) => {
                            inputRef.current = ref
                        }}
                        selection={
                            forcedSelection !== null
                                ? {
                                      start: forcedSelection,
                                      end: forcedSelection,
                                  }
                                : undefined
                        }
                        placeholder={placeholder}
                        onContentSizeChange={handleContentSizeChange}
                        containerStyle={[
                            style.textInputOuter,
                            { minHeight: inputHeight },
                        ]}
                        inputContainerStyle={[
                            style.textInputInner,
                            { minHeight: inputHeight },
                        ]}
                        inputStyle={inputStyle}
                        multiline
                        numberOfLines={3}
                        blurOnSubmit={false}
                        onFocus={() => {
                            setIsFocused(true)
                            // for caret tracking: ensure detector/caret are sane when Android hasn't delivered a selection yet
                            const pos = Math.min(
                                lastCaretRef.current ||
                                    selectionStart ||
                                    messageText.length,
                                messageText.length,
                            )
                            lastCaretRef.current = pos
                            if (mentionEnabled)
                                detectMentionTrigger(messageText, pos)
                        }}
                        onBlur={() => setIsFocused(false)}
                        disabled={inputDisabled}
                    />
                </View>

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
                         * - Polls are not available in broadcast rooms
                         * */}
                        {!isReadOnly &&
                            !directUserId &&
                            !isDefaultGroup &&
                            !existingRoom.broadcastOnly && (
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
                                        hitSlop={15}
                                        disabled={inputDisabled}>
                                        <SvgImage
                                            name="Close"
                                            color={theme.colors.white}
                                        />
                                    </Pressable>
                                    <Pressable
                                        style={style.saveButton}
                                        onPress={handleEdit}
                                        hitSlop={15}
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
                                    hitSlop={15}
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
        inputFieldWrapper: {
            position: 'relative',
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: 0,
            overflow: 'visible',
        },
        textInputOuter: {
            borderWidth: 0,
            paddingHorizontal: 0,
            paddingVertical: 0,
            backgroundColor: theme.colors.white,
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: 0,
        },
        textInputInner: {
            borderBottomWidth: 0,
            paddingTop: 0,
            paddingBottom: 0,
            alignItems: 'flex-start',
        },
        textInputStyle: {
            fontSize: fediTheme.fontSizes.body,
            textAlignVertical: 'top',
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
            position: 'relative',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: theme.spacing.lg,
            zIndex: 2,
            elevation: 2,
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
            position: 'relative',
            // Stretch the bar content edge-to-edge:
            marginLeft: -(theme.spacing.md + (insets.left || 0)),
            marginRight: -(theme.spacing.md + (insets.right || 0)),
            // Fill the container's top padding area with the same background without changing the bar's internal height/padding.
            marginTop: -theme.spacing.sm,
            paddingTop: Math.max(theme.spacing.sm - 4, 0),
            backgroundColor: theme.colors.offWhite100,
            width: 'auto',
            alignSelf: 'stretch',
        },
        replyBar: {
            width: '100%',
            height: 59,
            backgroundColor: 'transparent',
            borderTopWidth: 0,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.lightGrey,
            paddingTop: 12,
            paddingRight: (insets.right || 0) + 16,
            paddingBottom: 12,
            paddingLeft: (insets.left || 0) + 20,
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
            marginRight: 12,
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
        mentionOverlay: {
            position: 'absolute',
            bottom: '100%',
            marginBottom: 9, //so we can still see the top border of MessageInput
            zIndex: 2,
            elevation: 2,
            left: -(theme.spacing.md + (insets.left || 0)),
            right: -(theme.spacing.md + (insets.right || 0)),
        },
        guardianitoHelpTextContainer: {
            // TODO: clean up his hacky styling along with all of the AI slop in this entire file
            position: 'relative',
            marginLeft: -(theme.spacing.md + (insets.left || 0)),
            marginRight: -(theme.spacing.md + (insets.right || 0)),
            marginTop: -theme.spacing.sm,
            paddingTop: theme.spacing.xs,
            paddingBottom: theme.spacing.xs,
            paddingHorizontal: theme.spacing.md + (insets.left || 0),
            backgroundColor: theme.colors.offWhite100,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.primaryVeryLight,
        },
        guardianitoHelpText: {
            color: theme.colors.grey,
            textAlign: 'left',
        },
    })

export default MessageInput
