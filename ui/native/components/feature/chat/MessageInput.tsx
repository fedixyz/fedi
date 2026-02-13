import { useNavigation } from '@react-navigation/native'
import { Input, Theme, useTheme } from '@rneui/themed'
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
    View,
    Dimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { GUARDIANITO_BOT_DISPLAY_NAME } from '@fedi/common/constants/matrix'
import { theme as fediTheme } from '@fedi/common/constants/theme'
import { useMessageInputState } from '@fedi/common/hooks/chat'
import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useMentionInput } from '@fedi/common/hooks/matrix'
import { useToast } from '@fedi/common/hooks/toast'
import { useAsyncCallback } from '@fedi/common/hooks/util'
import {
    selectIsDefaultGroup,
    selectMatrixRoom,
    selectMatrixRoomIsReadOnly,
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
import { matrixIdToUsername } from '@fedi/common/utils/matrix'

import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { useMessageAttachments } from '../../../utils/hooks/attachments'
import { useKeyboard } from '../../../utils/hooks/keyboard'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'
import { AssetsList } from './AssetsList'
import ChatMentionSuggestions from './ChatMentionSuggestions'
import ChatWalletButton from './ChatWalletButton'
import { DocumentsList } from './DocumentsList'
import GuardianitoHelp from './GuardianitoHelp'
import MessageInputReplyBar from './MessageInputReplyBar'

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

const SUGGESTIONS_MIN_HEIGHT = 120

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
    const fedimint = useFedimint()

    const toast = useToast()
    const isReadOnly = useAppSelector(s => selectMatrixRoomIsReadOnly(s, id))
    const isDefaultGroup = useAppSelector(s => selectIsDefaultGroup(s, id))
    const isGuardianitoRoom =
        existingRoom?.name === GUARDIANITO_BOT_DISPLAY_NAME
    const isDirectChat = existingRoom?.isDirect
    const repliedEvent = useAppSelector(s =>
        selectReplyingToMessageEventForRoom(s, id),
    )
    const roomMembers = useAppSelector(s => selectMatrixRoomMembers(s, id))
    const auth = useAppSelector(selectMatrixAuth)
    const selfUserId = auth?.userId || undefined

    const {
        messageText,
        setMessageText,
        editingMessage,
        isEditingMessage,
        resetMessageText,
    } = useMessageInputState(id)

    const { isVisible: kbVisible, height: kbHeight } = useKeyboard()
    const [isFocused, setIsFocused] = useState(false)
    const [selection, setSelection] = useState<{ start: number; end: number }>({
        start: 0,
        end: 0,
    })
    const directUserId = useMemo(
        () => existingRoom?.directUserId ?? null,
        [existingRoom],
    )
    const mentionEnabled = useMemo(
        () => !(!!isDirectChat || (!existingRoom && !isPublic)),
        [isDirectChat, existingRoom, isPublic],
    )

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

    const { mentionSuggestions, shouldShowSuggestions, insertMention } =
        useMentionInput(membersForMentions, messageText, selection.start)

    const MIN_INPUT_H = theme.sizes.minMessageInputHeight
    const [inputHeight, setInputHeight] = useState<number>(MIN_INPUT_H)

    const inputRef = useRef<TextInput | null>(null)
    const inputDisabled = isSending || isReadOnly

    useEffect(() => {
        onReplyBarHeightChanged?.(0)
    }, [onReplyBarHeightChanged])

    const attachments = useMessageAttachments()

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

    const handleEdit = useCallback(async () => {
        if (!isEditingMessage || !messageText || !editingMessage?.id) return

        try {
            await dispatch(
                editMatrixMessage({
                    fedimint,
                    roomId: editingMessage.roomId,
                    eventId: editingMessage.id,
                    body: messageText,
                }),
            ).unwrap()
            resetMessageText()
            dispatch(setMessageToEdit(null))
        } catch (e) {
            toast.error(t, e, 'errors.chat-unavailable')
        }
    }, [
        dispatch,
        editingMessage,
        isEditingMessage,
        messageText,
        resetMessageText,
        t,
        toast,
        fedimint,
    ])

    const trimmedMessageText = messageText
        .trim()
        // Matches three or more whitespace characters, including newlines, tabs, etc
        .replace(/\s{3,}/g, match => match.slice(0, 2))

    const [handleSend, isSendingMessage] = useAsyncCallback(async () => {
        if ((!trimmedMessageText && !attachments.hasAttachments) || isSending)
            return

        try {
            await onMessageSubmitted(
                trimmedMessageText,
                attachments.matrixAttachments,
                repliedEvent?.id,
            )
            resetMessageText()
            attachments.clearAll()

            if (repliedEvent) {
                requestAnimationFrame(() => {
                    dispatch(clearChatReplyingToMessage())
                })
            }
        } catch (e) {
            toast.error(t, e, 'errors.chat-unavailable')
        }
    }, [
        attachments,
        isSending,
        trimmedMessageText,
        onMessageSubmitted,
        repliedEvent,
        dispatch,
        toast,
        t,
        resetMessageText,
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

    const handleSelectMention = useCallback(
        (item: MentionSelect) => {
            const { newText, newCursorPosition } = insertMention(
                item,
                messageText,
            )
            setMessageText(newText)
            setSelection({
                start: newCursorPosition,
                end: newCursorPosition,
            })
        },
        [messageText, insertMention, setMessageText],
    )

    const showMentionSuggestions =
        !isReadOnly &&
        !isEditingMessage &&
        mentionEnabled &&
        shouldShowSuggestions

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
            {repliedEvent && !isEditingMessage && !isReadOnly && (
                <MessageInputReplyBar
                    repliedEvent={repliedEvent}
                    roomMembers={roomMembers}
                />
            )}
            {isGuardianitoRoom && <GuardianitoHelp />}
            {attachments.shouldShowDocuments && (
                <DocumentsList
                    documents={attachments.documents}
                    pendingDocuments={attachments.documentsPending}
                    onRemove={attachments.removeDocument}
                />
            )}
            {attachments.shouldShowAssets && (
                <AssetsList
                    assets={attachments.media}
                    setAttachments={assets =>
                        // AssetsList expects a setter function, we filter to find removed items
                        attachments.media
                            .filter(m => !assets.includes(m))
                            .forEach(attachments.removeMedia)
                    }
                />
            )}

            {/* input row */}
            <View style={style.inputContainer}>
                {showMentionSuggestions && (
                    <View pointerEvents="auto" style={style.mentionOverlay}>
                        <ChatMentionSuggestions
                            visible
                            suggestions={mentionSuggestions}
                            onSelect={handleSelectMention}
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
                        testID="MessageInput-TextInput"
                        disableFullscreenUI
                        textBreakStrategy="simple"
                        onChangeText={value => setMessageText(value)}
                        // this prop is used to manipulate the cursor position
                        selection={selection}
                        // we need to make sure the selection prop stays
                        // in sync when we get a selection change event
                        // from the keyboard
                        onSelectionChange={e =>
                            setSelection(e.nativeEvent.selection)
                        }
                        value={messageText}
                        ref={(ref: TextInput | null) => {
                            inputRef.current = ref
                        }}
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
                        }}
                        onBlur={() => setIsFocused(false)}
                        disabled={inputDisabled}
                    />
                </View>

                {!isReadOnly && !existingRoom && (
                    <Pressable
                        testID="MessageInput-SendButton"
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
                            !isDirectChat &&
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
                                {attachments.isUploadingMedia ? (
                                    <ActivityIndicator size={theme.sizes.sm} />
                                ) : (
                                    <Pressable
                                        onPress={attachments.handlePickMedia}
                                        hitSlop={10}>
                                        <SvgImage name="Image" />
                                    </Pressable>
                                )}
                                {attachments.isUploadingDocuments ? (
                                    <ActivityIndicator size={theme.sizes.sm} />
                                ) : (
                                    <Pressable
                                        onPress={
                                            attachments.handlePickDocuments
                                        }
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
                                            resetMessageText()
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
                                    testID="MessageInput-SendButton"
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
        mentionOverlay: {
            position: 'absolute',
            bottom: '100%',
            marginBottom: 9, //so we can still see the top border of MessageInput
            zIndex: 2,
            elevation: 2,
            left: -(theme.spacing.md + (insets.left || 0)),
            right: -(theme.spacing.md + (insets.right || 0)),
        },
    })

export default MessageInput
