import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Input, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Keyboard,
    KeyboardEvent,
    Platform,
    StyleSheet,
    View,
} from 'react-native'

import { useDisplayNameForm } from '@fedi/common/hooks/chat'

import { fedimint } from '../bridge'
import { SafeScrollArea } from '../components/ui/SafeArea'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'EnterDisplayName'
>

const EnterDisplayName: React.FC<Props> = ({ navigation }: Props) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const [buttonIsOverlapping, setButtonIsOverlapping] =
        useState<boolean>(false)
    const [keyboardHeight, setKeyboardHeight] = useState<number>(0)
    const [buttonYPosition, setButtonYPosition] = useState<number>(0)
    const [overlapThreshold, setOverlapThreshold] = useState<number>(0)
    const {
        username,
        isSubmitting,
        errorMessage,
        handleChangeUsername,
        handleSubmitDisplayName,
    } = useDisplayNameForm(t, fedimint)

    // when the keyboard is opened and content layouts change, this effect
    // determines whether the Create username button is overlapping with
    // the input wrapper.
    useEffect(() => {
        if (
            keyboardHeight > 0 &&
            buttonYPosition > 0 &&
            overlapThreshold > 0 &&
            buttonYPosition < overlapThreshold
        ) {
            setButtonIsOverlapping(true)
        }
        // when keyboard closes be sure to reset buttonIsOverlapping
        // state so the button remains flexed to the bottom of the view
        if (keyboardHeight === 0 && buttonIsOverlapping === true) {
            setButtonIsOverlapping(false)
        }
    }, [buttonIsOverlapping, buttonYPosition, overlapThreshold, keyboardHeight])

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

    const handleSubmit = useCallback(() => {
        handleSubmitDisplayName(() => {
            navigation.reset({
                index: 0,
                routes: [{ name: 'UploadAvatarImage' }],
            })
        })
    }, [handleSubmitDisplayName, navigation])

    const style = styles(theme)

    return (
        <SafeScrollArea
            keyboardShouldPersistTaps="handled"
            edges="all"
            contentContainerStyle={[
                style.container,
                keyboardHeight > 0 && Platform.OS === 'ios'
                    ? { paddingBottom: keyboardHeight }
                    : {},
                buttonIsOverlapping ? { flex: 0 } : {},
            ]}>
            <View
                style={style.inputWrapper}
                onLayout={event => {
                    setOverlapThreshold(
                        event.nativeEvent.layout.height +
                            event.nativeEvent.layout.y,
                    )
                }}>
                <Text caption style={style.inputLabel}>
                    {t('feature.chat.display-name')}
                </Text>
                <Input
                    onChangeText={input => {
                        handleChangeUsername(input)
                    }}
                    value={username}
                    returnKeyType="done"
                    containerStyle={style.textInputOuter}
                    inputContainerStyle={style.textInputInner}
                    autoCapitalize={'none'}
                    autoCorrect={false}
                    disabled={isSubmitting}
                />
                <Text caption style={style.inputGuidance}>
                    {t('feature.onboarding.username-guidance')}
                </Text>
                {errorMessage && (
                    <Text caption style={style.errorLabel}>
                        {errorMessage}
                    </Text>
                )}
            </View>
            <View
                style={[
                    style.buttonContainer,
                    buttonIsOverlapping ? { marginTop: theme.sizes.md } : {},
                ]}
                onLayout={event => {
                    setButtonYPosition(event.nativeEvent.layout.y)
                }}>
                <Button
                    fullWidth
                    title={t('words.continue')}
                    onPress={handleSubmit}
                    disabled={
                        !username || isSubmitting || errorMessage !== null
                    }
                    loading={isSubmitting}
                />
            </View>
        </SafeScrollArea>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            alignItems: 'center',
            justifyContent: 'flex-start',
        },
        buttonContainer: {
            marginTop: 'auto',
            width: '100%',
        },
        instructionsText: {
            marginVertical: theme.spacing.md,
            textAlign: 'center',
        },
        titleText: {
            textAlign: 'center',
        },
        inputWrapper: {
            width: '100%',
            marginTop: theme.spacing.xl,
        },
        inputLabel: {
            textAlign: 'left',
            marginBottom: theme.spacing.xs,
            marginTop: theme.spacing.xs,
        },
        errorLabel: {
            textAlign: 'left',
            marginBottom: theme.spacing.xs,
            marginTop: theme.spacing.xs,
            color: theme.colors.red,
        },
        textInputInner: {
            borderBottomWidth: 0,
            height: '100%',
        },
        textInputOuter: {
            width: '100%',
            borderColor: theme.colors.primaryVeryLight,
            borderWidth: 1,
            borderRadius: theme.borders.defaultRadius,
        },
        inputGuidance: {
            textAlign: 'left',
            marginTop: theme.spacing.xs,
            color: theme.colors.grey,
        },
        loadingContainer: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
        },
    })

export default EnterDisplayName
