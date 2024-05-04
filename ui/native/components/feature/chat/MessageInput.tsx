import { Input, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Insets,
    Keyboard,
    KeyboardEvent,
    Platform,
    Pressable,
    StyleSheet,
    TextInput,
    View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { theme as fediTheme } from '@fedi/common/constants/theme'
import { useToast } from '@fedi/common/hooks/toast'
import {
    selectMatrixRoom,
    selectMatrixRoomIsReadOnly,
} from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'
import ChatWalletButton from './ChatWalletButton'

type MessageInputProps = {
    onMessageSubmitted: (message: string) => Promise<void>
    id: string
    isSending?: boolean
}

const MessageInput: React.FC<MessageInputProps> = ({
    onMessageSubmitted,
    id,
    isSending,
}: MessageInputProps) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const insets = useSafeAreaInsets()
    const existingRoom = useAppSelector(s => selectMatrixRoom(s, id))

    const toast = useToast()
    const isReadOnly = useAppSelector(s => selectMatrixRoomIsReadOnly(s, id))
    const [messageText, setMessageText] = useState<string>('')
    const [inputHeight, setInputHeight] = useState<number>(
        theme.sizes.minMessageInputHeight,
    )
    const [keyboardHeight, setKeyboardHeight] = useState<number>(0)
    const inputRef = useRef<TextInput | null>(null)

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

    const handleSend = useCallback(async () => {
        if (!messageText || isSending) return
        try {
            await onMessageSubmitted(messageText)
            setMessageText('')
        } catch (err) {
            toast.error(t, err, 'errors.chat-unavailable')
        }
    }, [isSending, messageText, onMessageSubmitted, toast, t])

    // Re-focus input after it had been disabled
    const inputDisabled = isSending || isReadOnly
    useEffect(() => {
        if (!inputDisabled) {
            inputRef.current?.focus()
        }
    }, [inputDisabled])

    const style = styles(theme, insets)
    const placeholder = useMemo(
        () =>
            isReadOnly
                ? t('feature.chat.broadcast-only-notice')
                : t('words.message'),
        [isReadOnly, t],
    )
    return (
        <View
            style={[
                style.container,
                keyboardHeight > 0 && Platform.OS === 'ios'
                    ? { paddingBottom: keyboardHeight + theme.spacing.lg }
                    : {},
                isReadOnly ? { borderTopWidth: 0 } : {},
            ]}>
            {/* in-chat payments only available for DirectChat after a room has already been created with the user */}
            {existingRoom && existingRoom.directUserId && (
                <ChatWalletButton recipientId={existingRoom.directUserId} />
            )}
            <Input
                onChangeText={setMessageText}
                value={messageText}
                ref={(ref: unknown) => {
                    inputRef.current = ref as TextInput
                }}
                placeholder={`${placeholder}`}
                onContentSizeChange={({
                    nativeEvent: {
                        contentSize: { height },
                    },
                }) => {
                    if (height > inputHeight) {
                        setInputHeight(
                            Math.min(theme.sizes.maxMessageInputHeight, height),
                        )
                    } else if (height < inputHeight) {
                        setInputHeight(
                            Math.max(theme.sizes.minMessageInputHeight, height),
                        )
                    }
                }}
                containerStyle={[style.textInputOuter, { height: inputHeight }]}
                inputContainerStyle={style.textInputInner}
                inputStyle={
                    isReadOnly ? style.textInputReadonly : style.textInputStyle
                }
                multiline
                numberOfLines={3}
                blurOnSubmit={false}
                disabled={inputDisabled}
            />
            {!isReadOnly && (
                <Pressable
                    style={style.sendButton}
                    onPress={handleSend}
                    disabled={inputDisabled}>
                    <SvgImage
                        name="SendArrowUpCircle"
                        size={SvgImageSize.md}
                        color={
                            inputDisabled
                                ? theme.colors.primaryVeryLight
                                : theme.colors.blue
                        }
                    />
                </Pressable>
            )}
        </View>
    )
}

const styles = (theme: Theme, insets: Insets) =>
    StyleSheet.create({
        container: {
            width: '100%',
            flexDirection: 'row',
            alignItems: 'flex-end',
            marginTop: 'auto',
            backgroundColor: theme.colors.secondary,
            borderTopColor: theme.colors.primaryVeryLight,
            borderTopWidth: 1,
            paddingTop: theme.spacing.md,
            paddingLeft: theme.spacing.lg + (insets.left || 0),
            paddingRight: theme.spacing.lg + (insets.right || 0),
            paddingBottom: Math.max(theme.spacing.lg, insets.bottom || 0),
            position: 'relative',
        },
        sendButton: {
            marginBottom: theme.spacing.sm,
        },
        textInputInner: {
            borderBottomWidth: 0,
            marginTop: theme.spacing.xs,
            paddingRight: theme.spacing.xl,
        },
        textInputOuter: {
            flex: 1,
            borderWidth: 0,
            backgroundColor: theme.colors.white,
        },
        textInputStyle: {
            fontSize: fediTheme.fontSizes.body,
        },
        textInputReadonly: {
            color: theme.colors.grey,
            fontSize: fediTheme.fontSizes.body,
            textAlign: 'center',
            paddingHorizontal: theme.spacing.xl,
        },
    })

export default MessageInput
