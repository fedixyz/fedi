import { Input, Overlay, Text, useTheme } from '@rneui/themed'
import { Theme } from '@rneui/themed/dist/config'
import {
    Dispatch,
    SetStateAction,
    useCallback,
    useEffect,
    useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
    Keyboard,
    Platform,
    KeyboardEvent,
    StyleSheet,
    View,
    Pressable,
    NativeSyntheticEvent,
    TextInputSubmitEditingEventData,
} from 'react-native'

import {
    selectAddressOverlayOpen,
    selectSiteInfo,
    setAddressOverlayOpen,
} from '@fedi/common/redux'

import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import Flex from '../../ui/Flex'
import { SafeAreaContainer } from '../../ui/SafeArea'
import SvgImage from '../../ui/SvgImage'

export default function AddressBarOverlay({
    setBrowserUrl,
}: {
    setBrowserUrl: Dispatch<SetStateAction<string>>
}) {
    const addressOverlayOpen = useAppSelector(selectAddressOverlayOpen)
    const { t } = useTranslation()
    const { theme } = useTheme()
    const dispatch = useAppDispatch()
    const siteInfo = useAppSelector(selectSiteInfo)

    const [keyboardHeight, setKeyboardHeight] = useState<number>(0)
    const [url, setUrl] = useState<string>(siteInfo?.url ?? '')

    const style = styles(theme)

    const close = useCallback(() => {
        dispatch(setAddressOverlayOpen(false))
    }, [dispatch])

    const handleNavigate = useCallback(
        (e: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => {
            const text = e.nativeEvent.text

            if (!text) return

            try {
                if (!/^(https?:\/\/)?[\w-]+(\.[\w-]+)+$/i.test(text))
                    throw new Error('Invalid URL')

                const resolvedUrl = new URL(
                    /https?:\/\//.test(text) ? text : `https://${text}`,
                )

                setBrowserUrl(resolvedUrl.toString())
            } catch {
                setBrowserUrl('https://google.com/search?q=' + text)
            } finally {
                close()
            }
        },
        [close, setBrowserUrl],
    )

    useEffect(() => {
        const keyboardShownListener = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
            (e: KeyboardEvent) => {
                setKeyboardHeight(e.endCoordinates.height)
            },
        )
        const keyboardHiddenListener = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
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
        if (siteInfo) {
            setUrl(siteInfo.url)
        }
    }, [siteInfo, setBrowserUrl, addressOverlayOpen])

    return (
        <Overlay
            isVisible={addressOverlayOpen}
            overlayStyle={style.container}
            onBackdropPress={close}>
            <SafeAreaContainer
                edges={{
                    top: 'additive',
                    left: 'additive',
                    right: 'additive',
                    bottom: 'additive',
                }}
                style={[
                    keyboardHeight > 0 && Platform.OS === 'ios'
                        ? { paddingBottom: keyboardHeight + theme.spacing.lg }
                        : {},
                ]}>
                <Flex row align="center" gap="md" fullWidth>
                    <Input
                        inputContainerStyle={style.input}
                        containerStyle={style.inputContainer}
                        style={style.inputStyle}
                        value={url}
                        onChangeText={setUrl}
                        rightIcon={
                            <Pressable onPress={() => setUrl('')}>
                                <View style={style.clearIcon}>
                                    <SvgImage name="Close" size={16} />
                                </View>
                            </Pressable>
                        }
                        autoCapitalize="none"
                        autoCorrect={false}
                        onSubmitEditing={handleNavigate}
                        returnKeyType="go"
                        autoFocus
                        selectTextOnFocus
                    />
                    <Pressable onPress={close}>
                        <Text caption>{t('words.cancel')}</Text>
                    </Pressable>
                </Flex>
            </SafeAreaContainer>
        </Overlay>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: 0,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
        },
        inputStyle: {
            fontSize: 14,
            minHeight: 0,
            height: 40,
            flex: 1,
        },
        input: {
            borderBottomWidth: 0,
            minHeight: 0,
            height: 40,
        },
        inputContainer: {
            paddingLeft: theme.spacing.md,
            paddingRight: theme.spacing.sm,
            borderRadius: 8,
            backgroundColor: theme.colors.extraLightGrey,
            minHeight: 0,
            height: 40,
            width: 'auto',
            flex: 1,
        },
        clearIcon: {
            backgroundColor: theme.colors.lightGrey,
            borderRadius: 32,
            padding: theme.spacing.xxs,
        },
    })
