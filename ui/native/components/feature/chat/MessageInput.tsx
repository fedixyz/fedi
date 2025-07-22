import { useNavigation } from '@react-navigation/native'
import { Input, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
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
} from 'react-native'
import { DocumentPickerResponse, types } from 'react-native-document-picker'
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
} from '@fedi/common/redux'
import { InputAttachment, InputMedia } from '@fedi/common/types'
import { makeLog } from '@fedi/common/utils/log'
import { getEventId } from '@fedi/common/utils/matrix'
import { formatFileSize } from '@fedi/common/utils/media'

import { fedimint } from '../../../bridge'
import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import {
    copyDocumentToTempUri,
    copyAssetToTempUri,
    tryPickAssets,
    tryPickDocuments,
    mapMixedMediaToMatrixInput,
} from '../../../utils/media'
import { Attachments } from '../../ui/Attachments'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'
import ChatWalletButton from './ChatWalletButton'

type MessageInputProps = {
    onMessageSubmitted: (
        message: string,
        attachments?: Array<InputAttachment | InputMedia>,
    ) => Promise<void>
    id: string
    isSending?: boolean
    isPublic?: boolean
    onHeightChanged?: (height: number) => void
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

    const drafts = useAppSelector(s => selectChatDrafts(s))
    const [inputHeight, setInputHeight] = useState<number>(
        theme.sizes.minMessageInputHeight,
    )
    const [keyboardHeight, setKeyboardHeight] = useState<number>(0)
    const [messageText, setMessageText] = useState<string>(drafts[id] ?? '')
    const [isSendingMessage, setIsSendingMessage] = useState(false)
    const directUserId = useMemo(
        () => existingRoom?.directUserId ?? null,
        [existingRoom],
    )
    const inputRef = useRef<TextInput | null>(null)
    const editingMessage = useAppSelector(selectMessageToEdit)

    const isEditingMessage = !!editingMessage
    const inputDisabled = isSending || isReadOnly

    useDebouncedEffect(
        () => {
            dispatch(setChatDraft({ roomId: id, text: messageText }))
        },
        [messageText, dispatch],
        500,
    )
    const [documents, setDocuments] = useState<DocumentPickerResponse[]>([])
    const [media, setMedia] = useState<Asset[]>([])

    const combinedUploads = useMemo(
        () => mapMixedMediaToMatrixInput({ documents, assets: media }),
        [documents, media],
    )

    const handleUploadMedia = useCallback(async () => {
        tryPickAssets(imageOptions, t).match(
            async assets => {
                const assetsToUpload: Array<Asset> = []

                await Promise.all(
                    assets.map(asset =>
                        copyAssetToTempUri(asset).map(uri =>
                            assetsToUpload.push({ ...asset, uri }),
                        ),
                    ),
                )

                setMedia(imgs => [...imgs, ...assetsToUpload])
            },
            e => {
                log.error('launchImageLibrary Error: ', e)

                // Only show a toast if the error is the user's fault
                if (e._tag === 'UserError') toast.error(t, e)
            },
        )
    }, [t, toast])

    const handleUploadDocument = useCallback(() => {
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
            },
            t,
        ).match(
            async files => {
                const documentsToUpload: Array<DocumentPickerResponse> = []

                await Promise.all(
                    files.map(file =>
                        copyDocumentToTempUri(file).map(uri =>
                            documentsToUpload.push({ ...file, uri }),
                        ),
                    ),
                )

                setDocuments(att => [...att, ...documentsToUpload])
            },
            e => {
                log.error('DocumentPicker Error: ', e)

                // Only show a toast if the error is the user's fault
                if (e._tag === 'UserError') toast.error(t, e)
            },
        )
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

    useEffect(() => {
        if (editingMessage) {
            setMessageText(editingMessage.content.body)
        }
    }, [editingMessage])

    const handleSend = useCallback(async () => {
        if (
            (!trimmedMessageText && !combinedUploads.length) ||
            isSending ||
            isSendingMessage
        )
            return

        setIsSendingMessage(true)

        try {
            await onMessageSubmitted(trimmedMessageText, combinedUploads)
            setMessageText('')
            setMedia([])
            setDocuments([])
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

    return (
        <View
            onLayout={onLayout}
            style={[
                style.container,
                keyboardHeight > 0 && Platform.OS === 'ios'
                    ? { paddingBottom: keyboardHeight + theme.spacing.lg }
                    : { paddingBottom: theme.spacing.lg + insets.bottom },
                isReadOnly ? { borderTopWidth: 0 } : {},
            ]}>
            {documents.length > 0 && (
                <View style={style.attachmentContainer}>
                    {documents.map((att, i) => (
                        <View key={i} style={style.attachment}>
                            <View style={style.attachmentIcon}>
                                <SvgImage name="File" />
                            </View>
                            <View style={style.attachmentContent}>
                                <Text>{att.name}</Text>
                                <Text style={style.attachmentSize}>
                                    {formatFileSize(att.size ?? 0)}
                                </Text>
                            </View>
                            <Pressable
                                style={style.removeButton}
                                onPress={() =>
                                    setDocuments(prev =>
                                        prev.filter(a => a.uri !== att.uri),
                                    )
                                }>
                                <SvgImage
                                    name="Close"
                                    size={SvgImageSize.xs}
                                    color={theme.colors.white}
                                />
                            </Pressable>
                        </View>
                    ))}
                </View>
            )}
            {media.length > 0 && (
                <Attachments
                    attachments={media}
                    setAttachments={setMedia}
                    uploadButton={false}
                    options={imageOptions}
                />
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
                                <Pressable
                                    onPress={handleUploadMedia}
                                    hitSlop={10}>
                                    <SvgImage name="Image" />
                                </Pressable>
                                <Pressable
                                    onPress={handleUploadDocument}
                                    hitSlop={10}>
                                    <SvgImage name="Plus" />
                                </Pressable>
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
    })

export default MessageInput
