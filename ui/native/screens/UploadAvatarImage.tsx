import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import RNFS from 'react-native-fs'
import { launchImageLibrary } from 'react-native-image-picker'

import { useToast } from '@fedi/common/hooks/toast'
import {
    selectMatrixAuth,
    uploadAndSetMatrixAvatarUrl,
} from '@fedi/common/redux'

import { fedimint } from '../bridge'
import { StoragePermissionGate } from '../components/feature/permissions/StoragePermissionGate'
import Avatar, { AvatarSize } from '../components/ui/Avatar'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'UploadAvatarImage'
>

const UploadAvatarImage: React.FC<Props> = ({ navigation }: Props) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const toast = useToast()
    const dispatch = useAppDispatch()

    const style = styles(theme)

    const [isUploading, setIsUploading] = useState<boolean>(false)
    const [didUpload, setDidUpload] = useState<boolean>(false)
    const [imageUri, setImageUri] = useState<string>('')

    const finishStep = () => {
        navigation.reset({
            index: 0,
            routes: [{ name: 'FederationGreeting' }],
        })
    }

    const handleUploadPress = useCallback(async () => {
        try {
            const res = await launchImageLibrary({
                selectionLimit: 1,
                mediaType: 'photo',
            })

            if (!res.assets || res.assets.length === 0) return

            const file = res.assets[0]

            if (!file.uri) return

            const mimeType = file.type || ''
            const fileDestination = `${RNFS.TemporaryDirectoryPath}/avatar_image`

            setIsUploading(true)

            await RNFS.copyFile(file.uri, fileDestination)

            await dispatch(
                uploadAndSetMatrixAvatarUrl({
                    fedimint,
                    mimeType,
                    path: fileDestination,
                }),
            ).unwrap()

            setImageUri(file.uri)
            setDidUpload(true)
        } catch (err) {
            toast.error(t, err)
        } finally {
            setIsUploading(false)
        }
    }, [dispatch, t, toast])

    const renderPreUploadButtons = () => {
        return (
            <View style={style.buttonContainer}>
                <Button
                    titleStyle={style.skipButtonText}
                    color={theme.colors.offWhite100}
                    fullWidth
                    title={t('words.skip')}
                    onPress={finishStep}
                    disabled={isUploading || didUpload}
                />

                <Button
                    fullWidth
                    title={t('feature.chat.add-a-photo')}
                    onPress={handleUploadPress}
                    disabled={isUploading || didUpload}
                    loading={isUploading}
                />
            </View>
        )
    }

    const renderPostUploadButtons = () => {
        return (
            <View style={style.buttonContainer}>
                <Button
                    fullWidth
                    title={t('words.continue')}
                    onPress={finishStep}
                />
            </View>
        )
    }

    const matrixAuth = useAppSelector(selectMatrixAuth)
    const displayName = matrixAuth?.displayName || ''

    // don't show name in avatar if avatar image is present
    const avatarName = imageUri ? '' : displayName

    const greeting = didUpload
        ? `${t('feature.onboarding.greeting-image')}, ${displayName}`
        : `${t('words.hello')}, ${displayName}`

    return (
        <StoragePermissionGate
            alternativeActionButton={
                <Button
                    title={t('words.skip')}
                    onPress={finishStep}
                    type="clear"
                />
            }>
            <SafeAreaContainer style={style.container} edges="notop">
                <View style={style.avatarContainer}>
                    <Avatar
                        id={matrixAuth?.userId || ''}
                        url={imageUri}
                        size={AvatarSize.lg}
                        name={avatarName}
                    />

                    <Text h2>{greeting}</Text>
                </View>

                {didUpload
                    ? renderPostUploadButtons()
                    : renderPreUploadButtons()}
            </SafeAreaContainer>
        </StoragePermissionGate>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            alignItems: 'center',
            justifyContent: 'flex-start',
        },
        avatarContainer: {
            alignItems: 'center',
            gap: theme.spacing.sm,
            paddingTop: theme.spacing.xxl,
        },
        buttonContainer: {
            gap: theme.spacing.sm,
            marginTop: 'auto',
            width: '100%',
        },
        skipButtonText: {
            color: theme.colors.black,
        },
    })

export default UploadAvatarImage
