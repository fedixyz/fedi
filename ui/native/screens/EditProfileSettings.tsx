import { Button, Input, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    GestureResponderEvent,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native'
import RNFS from 'react-native-fs'
import { launchImageLibrary } from 'react-native-image-picker'
import { RESULTS } from 'react-native-permissions'
import { EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context'

import { useDisplayNameForm } from '@fedi/common/hooks/chat'
import { useToast } from '@fedi/common/hooks/toast'
import {
    selectMatrixAuth,
    uploadAndSetMatrixAvatarUrl,
} from '@fedi/common/redux'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../bridge'
import Avatar, { AvatarSize } from '../components/ui/Avatar'
import { Pressable } from '../components/ui/Pressable'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { useStoragePermission } from '../utils/hooks'

const log = makeLog('EditProfile')

const EditProfileSettings: React.FC = () => {
    const { theme } = useTheme()
    const insets = useSafeAreaInsets()
    const { t } = useTranslation()
    const toast = useToast()
    const dispatch = useAppDispatch()

    const matrixAuth = useAppSelector(selectMatrixAuth)
    const { storagePermission, requestStoragePermission } =
        useStoragePermission()

    const style = styles(theme, insets)

    const [buttonIsOverlapping, setButtonIsOverlapping] = useState<boolean>()
    const [keyboardHeight] = useState<number>(0)
    const [buttonYPosition, setButtonYPosition] = useState<number>(0)
    const [overlapThreshold] = useState<number>(0)

    const {
        isSubmitting,
        username,
        errorMessage,
        handleChangeUsername,
        handleSubmitDisplayName,
    } = useDisplayNameForm(t)

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

    const handleAvatarPress = async (_: GestureResponderEvent) => {
        if (storagePermission !== RESULTS.GRANTED) {
            await requestStoragePermission()
        }

        try {
            const res = await launchImageLibrary({
                selectionLimit: 1,
                mediaType: 'photo',
            })

            if (res.assets && res.assets.length > 0) {
                const file = res.assets[0]
                const mimeType = file.type || ''

                if (!file.uri) {
                    return
                }

                const fileDestination = `${RNFS.TemporaryDirectoryPath}/avatar_image`

                try {
                    const fileExists = await RNFS.exists(fileDestination)

                    if (fileExists) {
                        await RNFS.unlink(fileDestination)
                    }
                } catch (e) {
                    log.error('no existing file to remove')
                }

                await RNFS.copyFile(file.uri, fileDestination)

                await dispatch(
                    uploadAndSetMatrixAvatarUrl({
                        fedimint,
                        mimeType,
                        path: fileDestination,
                    }),
                ).unwrap()

                toast.show({
                    content: t('phrases.changes-saved'),
                    status: 'success',
                })
            }
        } catch (err) {
            log.error('Failed to launch image library', err)
            toast.error(t, err)
        }
    }

    const handleNameSubmit = useCallback(() => {
        handleSubmitDisplayName(() => {
            toast.show({
                content: t('phrases.changes-saved'),
                status: 'success',
            })
        })
    }, [handleSubmitDisplayName, t, toast])

    let avatarName = matrixAuth?.displayName

    // don't use name if we have an avatar image
    if (matrixAuth?.avatarUrl) {
        avatarName = ''
    }

    const saveButtonDisabled =
        username === matrixAuth?.displayName ||
        !username ||
        isSubmitting ||
        errorMessage !== null

    return (
        <ScrollView
            style={style.scrollContainer}
            contentContainerStyle={style.contentContainer}
            overScrollMode="auto">
            <View>
                <Pressable
                    onPress={handleAvatarPress}
                    containerStyle={style.avatar}>
                    <Avatar
                        id={matrixAuth?.userId || ''}
                        url={matrixAuth?.avatarUrl}
                        size={AvatarSize.lg}
                        name={avatarName}
                    />
                    <Text caption>{t('feature.chat.change-avatar')}</Text>
                </Pressable>
            </View>

            <View style={style.container}>
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
                    title={t('words.save')}
                    onPress={handleNameSubmit}
                    disabled={saveButtonDisabled}
                    loading={isSubmitting}
                />
            </View>
        </ScrollView>
    )
}

const styles = (theme: Theme, insets: EdgeInsets) =>
    StyleSheet.create({
        scrollContainer: {
            flex: 1,
        },
        avatar: {
            alignItems: 'center',
            flexDirection: 'column',
            gap: theme.spacing.sm,
        },
        buttonContainer: {
            marginTop: 'auto',
            width: '100%',
        },
        contentContainer: {
            flexGrow: 1,
            paddingTop: theme.spacing.lg,
            paddingLeft: insets.left + theme.spacing.lg,
            paddingRight: insets.right + theme.spacing.lg,
            paddingBottom: Math.max(insets.bottom, theme.spacing.lg),
            gap: theme.spacing.md,
        },
        container: {
            flex: 1,
            flexDirection: 'column',
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
