import { Button, Input, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GestureResponderEvent, StyleSheet, View } from 'react-native'
import { RESULTS } from 'react-native-permissions'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useDisplayNameForm } from '@fedi/common/hooks/chat'
import { useToast } from '@fedi/common/hooks/toast'
import {
    selectMatrixAuth,
    uploadAndSetMatrixAvatarUrl,
} from '@fedi/common/redux'
import { makeLog } from '@fedi/common/utils/log'
import { ensureNonNullish } from '@fedi/common/utils/neverthrow'

import { fedimint } from '../bridge'
import Avatar, { AvatarSize } from '../components/ui/Avatar'
import Flex from '../components/ui/Flex'
import KeyboardAwareWrapper from '../components/ui/KeyboardAwareWrapper'
import { Pressable } from '../components/ui/Pressable'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { useStoragePermission } from '../utils/hooks'
import {
    copyAssetToTempUri,
    stripFileUriPrefix,
    tryPickAssets,
} from '../utils/media'

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
    const matrixAuth = useAppSelector(selectMatrixAuth)
    const insets = useSafeAreaInsets()

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
                .andThen(copyAssetToTempUri)
                .match(setProfileImageUri, e => {
                    log.error('Failed to launch image library', e)

                    if (e._tag === 'UserError') toast.error(t, e)
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
        toast.show({
            content: t('phrases.changes-saved'),
            status: 'success',
        })
    }, [
        handleSubmitDisplayName,
        t,
        toast,
        dispatch,
        profileImageUri,
        profileImageMimeType,
    ])

    const style = styles(theme)

    const hasChanged =
        username.trim() !== matrixAuth?.displayName || profileImageUri !== null

    const saveButtonDisabled = !hasChanged || isLoading || errorMessage !== null

    return (
        <KeyboardAwareWrapper
            behavior="padding"
            additionalVerticalOffset={insets.top}>
            <SafeAreaContainer style={style.container} edges="notop">
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
                        onChangeText={input => {
                            handleChangeUsername(input)
                        }}
                        value={username}
                        returnKeyType="done"
                        keyboardType="visible-password"
                        containerStyle={style.textInputOuter}
                        inputContainerStyle={style.textInputInner}
                        autoCapitalize={'none'}
                        autoCorrect={false}
                        disabled={isLoading}
                    />
                    {errorMessage && (
                        <Text caption style={style.errorLabel}>
                            {errorMessage}
                        </Text>
                    )}
                </Flex>

                <View style={[style.buttonContainer]}>
                    <Button
                        fullWidth
                        title={t('words.save')}
                        onPress={handleNameSubmit}
                        disabled={saveButtonDisabled}
                        loading={isLoading}
                    />
                </View>
            </SafeAreaContainer>
        </KeyboardAwareWrapper>
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
            marginTop: 'auto',
            width: '100%',
        },
        container: {
            gap: theme.spacing.md,
            width: '100%',
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
