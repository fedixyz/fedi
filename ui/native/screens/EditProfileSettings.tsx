import { useHeaderHeight } from '@react-navigation/elements'
import { useNavigation } from '@react-navigation/native'
import { Button, Input, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ActivityIndicator,
    GestureResponderEvent,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    View,
} from 'react-native'
import { ScrollView } from 'react-native-gesture-handler'
import { RESULTS } from 'react-native-permissions'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useDisplayNameForm } from '@fedi/common/hooks/chat'
import { useToast } from '@fedi/common/hooks/toast'
import {
    selectMatrixAuth,
    uploadAndSetMatrixAvatarUrl,
} from '@fedi/common/redux'
import { makeLog } from '@fedi/common/utils/log'
import { stripFileUriPrefix } from '@fedi/common/utils/media'
import { ensureNonNullish } from '@fedi/common/utils/neverthrow'

import { fedimint } from '../bridge'
import Avatar, { AvatarSize } from '../components/ui/Avatar'
import Flex from '../components/ui/Flex'
import { Pressable } from '../components/ui/Pressable'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { useStoragePermission } from '../utils/hooks'
import { useImeFooterLift } from '../utils/hooks/keyboard'
import { tryPickAssets } from '../utils/media'

const log = makeLog('EditProfile')

const EditProfileSettings: React.FC = () => {
    const [profileImageUri, setProfileImageUri] = useState<string | null>(null)
    const [profileImageMimeType, setProfileImageMimeType] = useState('')
    const [isLoading, setIsLoading] = useState(false)

    const { theme } = useTheme()
    const { t } = useTranslation()
    const { storagePermission, requestStoragePermission } =
        useStoragePermission()
    const {
        username,
        errorMessage,
        handleChangeUsername,
        handleSubmitDisplayName,
    } = useDisplayNameForm(t)

    const toast = useToast()
    const dispatch = useAppDispatch()
    const navigation = useNavigation()
    const matrixAuth = useAppSelector(selectMatrixAuth)

    const insets = useSafeAreaInsets()
    const headerHeight = useHeaderHeight()
    const iosOffset = Math.max(0, headerHeight - insets.top + theme.spacing.xl)

    const style = styles(theme)

    const extraPadAndroid35 = useImeFooterLift()

    const handleAvatarPress = useCallback(
        async (_: GestureResponderEvent) => {
            if (storagePermission !== RESULTS.GRANTED) {
                await requestStoragePermission()
            }

            tryPickAssets(
                {
                    selectionLimit: 1,
                    mediaType: 'photo',
                    maxWidth: 1024,
                    maxHeight: 1024,
                    quality: 0.7,
                },
                t,
            )
                .map(assets => assets[0])
                .andThen(ensureNonNullish)
                .andTee(({ type }) => setProfileImageMimeType(type ?? ''))
                .map(asset => asset.uri)
                .andThen(ensureNonNullish)
                .match(setProfileImageUri, e => {
                    log.error('Failed to launch image library', e)
                    if (e._tag !== 'UserError') {
                        toast.error(t, e)
                    }
                })
        },
        [storagePermission, requestStoragePermission, t, toast],
    )

    const handleNameSubmit = useCallback(async () => {
        setIsLoading(true)
        await handleSubmitDisplayName()

        if (profileImageUri) {
            await dispatch(
                uploadAndSetMatrixAvatarUrl({
                    fedimint,
                    mimeType: profileImageMimeType,
                    path: stripFileUriPrefix(profileImageUri),
                }),
            ).unwrap()
            setProfileImageUri(null)
            setProfileImageMimeType('')
        }

        setIsLoading(false)

        navigation.navigate('Settings')
    }, [
        handleSubmitDisplayName,
        dispatch,
        profileImageUri,
        profileImageMimeType,
        navigation,
    ])
    const hasChanged =
        username.trim() !== matrixAuth?.displayName || profileImageUri !== null

    const saveButtonDisabled = !hasChanged || isLoading || errorMessage !== null

    // in case matrix is not initialized yet
    if (!matrixAuth) return <ActivityIndicator />

    const content = (
        <>
            <ScrollView
                keyboardShouldPersistTaps="handled"
                contentInsetAdjustmentBehavior="never"
                contentContainerStyle={style.contentContainer}
                style={style.container}>
                <Pressable
                    onPress={handleAvatarPress}
                    containerStyle={style.avatar}>
                    <Avatar
                        id={matrixAuth?.userId || ''}
                        url={profileImageUri ?? matrixAuth?.avatarUrl}
                        size={AvatarSize.lg}
                        name={matrixAuth?.displayName}
                    />
                    <Text caption>{t('feature.chat.change-avatar')}</Text>
                </Pressable>

                <Flex grow style={style.content}>
                    <Text
                        testID="DisplayNameLabel"
                        caption
                        style={style.inputLabel}>
                        {t('feature.chat.display-name')}
                    </Text>
                    <Input
                        testID="DisplayNameInput"
                        onChangeText={handleChangeUsername}
                        value={username}
                        returnKeyType="done"
                        keyboardType="visible-password"
                        containerStyle={style.textInputOuter}
                        inputContainerStyle={style.textInputInner}
                        autoCapitalize="none"
                        autoCorrect={false}
                        disabled={isLoading}
                    />
                    {errorMessage && (
                        <Text caption style={style.errorLabel}>
                            {errorMessage}
                        </Text>
                    )}
                </Flex>
            </ScrollView>

            <View
                style={[
                    style.buttonContainer,
                    {
                        paddingBottom: insets.bottom + theme.spacing.lg,
                        marginBottom: extraPadAndroid35, // lifts footer ONLY on Android API 35+
                    },
                ]}>
                <Button
                    fullWidth
                    title={t('words.save')}
                    onPress={handleNameSubmit}
                    disabled={saveButtonDisabled}
                    loading={isLoading}
                />
            </View>
        </>
    )

    return Platform.OS === 'ios' ? (
        <KeyboardAvoidingView
            behavior="padding"
            style={style.container}
            keyboardVerticalOffset={iosOffset}>
            {content}
        </KeyboardAvoidingView>
    ) : (
        <View style={style.container}>{content}</View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        avatar: {
            alignItems: 'center',
            flexDirection: 'column',
            gap: theme.spacing.sm,
        },
        buttonContainer: {
            paddingTop: theme.spacing.lg,
            paddingHorizontal: theme.spacing.lg,
            backgroundColor: theme.colors?.background,
            width: '100%',
        },
        container: {
            flex: 1,
            gap: theme.spacing.md,
            width: '100%',
        },
        contentContainer: {
            flexGrow: 1,
            paddingHorizontal: theme.spacing.xl,
            paddingBottom: theme.spacing.xl,
        },
        content: {
            marginTop: theme.spacing.md,
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
        radioContainer: {
            margin: 0,
            paddingHorizontal: 0,
        },
        radioText: {
            paddingHorizontal: theme.spacing.md,
            textAlign: 'left',
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
    })

export default EditProfileSettings
