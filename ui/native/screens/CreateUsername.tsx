import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Input, Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ActivityIndicator,
    Keyboard,
    KeyboardEvent,
    Platform,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native'
import { useSafeAreaInsets, EdgeInsets } from 'react-native-safe-area-context'

import { useToast } from '@fedi/common/hooks/toast'
import { authenticateChat, selectActiveFederationId } from '@fedi/common/redux'
import { formatErrorMessage } from '@fedi/common/utils/format'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../bridge'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('CreateUsername')

export type Props = NativeStackScreenProps<RootStackParamList, 'CreateUsername'>

const CreateUsername: React.FC<Props> = ({ navigation }: Props) => {
    const insets = useSafeAreaInsets()
    const { theme } = useTheme()
    const { t } = useTranslation()
    const activeFederationId = useAppSelector(selectActiveFederationId)
    const dispatch = useAppDispatch()
    const toast = useToast()
    const [username, setUsername] = useState<string>('')
    const [isRecoveringUsername, setIsRecoveringUsername] = useState(true)
    const [xmppAuthInProgress, setXmppAuthInProgress] = useState<boolean>(false)
    const [buttonIsOverlapping, setButtonIsOverlapping] =
        useState<boolean>(false)
    const [keyboardHeight, setKeyboardHeight] = useState<number>(0)
    const [buttonYPosition, setButtonYPosition] = useState<number>(0)
    const [overlapThreshold, setOverlapThreshold] = useState<number>(0)

    // Attempt to fetch username from the bridge in case they were previously
    // a member.
    useEffect(() => {
        async function fetchCreds() {
            if (!activeFederationId) return
            const creds = await fedimint.getXmppCredentials(activeFederationId)
            if (!creds.username) {
                setIsRecoveringUsername(false)
                return
            }
            try {
                setUsername(creds.username)
                await dispatch(
                    authenticateChat({
                        fedimint,
                        federationId: activeFederationId,
                        username: creds.username.toLowerCase(),
                    }),
                ).unwrap()
                navigation.reset({
                    index: 0,
                    routes: [{ name: 'FederationGreeting' }],
                })
            } catch (err) {
                log.error('failed to fetch xmpp credentials', err)
                toast.error(t, err)
            }
            setIsRecoveringUsername(false)
        }
        fetchCreds()
    }, [activeFederationId, dispatch, navigation, t, toast])

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

    const handleSubmit = async () => {
        setXmppAuthInProgress(true)
    }

    useEffect(() => {
        const handleXmppRegistration = async () => {
            try {
                await dispatch(
                    authenticateChat({
                        fedimint,
                        federationId: activeFederationId as string,
                        username: username.toLowerCase(),
                    }),
                ).unwrap()
                setXmppAuthInProgress(false)
                navigation.reset({
                    index: 0,
                    routes: [{ name: 'FederationGreeting' }],
                })
            } catch (error: unknown) {
                if ((error as Error).message) {
                    setXmppAuthInProgress(false)
                    const errorMessage = formatErrorMessage(t, error)
                    log.info(errorMessage)
                    toast.error(t, error)
                } else {
                    log.error((error as Error).toString())
                }
            }
        }
        if (xmppAuthInProgress === true) {
            handleXmppRegistration()
        }
    }, [
        dispatch,
        navigation,
        toast,
        t,
        username,
        xmppAuthInProgress,
        activeFederationId,
    ])

    const handleUsernameChange = (input: string) => {
        const isValid = /^[^"&'/:<>\s]+$|^$/.test(input)
        if (!isValid) {
            toast.show({
                content: t('errors.invalid-character'),
                status: 'error',
            })
        } else {
            setUsername(input)
        }
    }

    const style = styles(theme, insets)

    if (isRecoveringUsername) {
        return (
            <View style={style.loadingContainer}>
                <ActivityIndicator />
            </View>
        )
    }

    return (
        <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
                style.container,
                keyboardHeight > 0 && Platform.OS === 'ios'
                    ? { paddingBottom: keyboardHeight + theme.spacing.xl }
                    : {},
                buttonIsOverlapping ? { flex: 0 } : {},
            ]}>
            <Text h2 medium style={style.titleText}>
                {t('feature.onboarding.create-your-username')}
            </Text>
            <Text caption style={style.instructionsText}>
                {t('feature.onboarding.username-instructions')}
            </Text>
            <View
                style={style.inputWrapper}
                onLayout={event => {
                    setOverlapThreshold(
                        event.nativeEvent.layout.height +
                            event.nativeEvent.layout.y,
                    )
                }}>
                <Text caption style={style.inputLabel}>
                    {t('words.username')}
                </Text>
                <Input
                    onChangeText={input => {
                        handleUsernameChange(input)
                    }}
                    value={username}
                    placeholder={`${t('feature.onboarding.enter-username')}...`}
                    returnKeyType="done"
                    containerStyle={style.textInputOuter}
                    inputContainerStyle={style.textInputInner}
                    autoCapitalize={'none'}
                    autoCorrect={false}
                    disabled={xmppAuthInProgress}
                />
                <Text caption style={style.inputGuidance}>
                    {t('feature.onboarding.username-guidance')}
                </Text>
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
                    title={t('feature.onboarding.create-username')}
                    onPress={handleSubmit}
                    disabled={!username || xmppAuthInProgress}
                    loading={xmppAuthInProgress}
                />
            </View>
        </ScrollView>
    )
}

const styles = (theme: Theme, insets: EdgeInsets) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'flex-start',
            padding: theme.spacing.xl,
            paddingBottom: Math.max(theme.spacing.xl, insets.bottom || 0),
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
            marginLeft: theme.spacing.sm,
            marginBottom: theme.spacing.xs,
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
            marginLeft: theme.spacing.sm,
            marginTop: theme.spacing.xs,
            color: theme.colors.grey,
        },
        loadingContainer: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
        },
    })

export default CreateUsername
