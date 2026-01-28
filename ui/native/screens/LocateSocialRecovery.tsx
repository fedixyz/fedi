import {
    pick,
    DocumentPickerResponse,
    types,
} from '@react-native-documents/picker'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Image, Pressable, StyleSheet, View } from 'react-native'
import RNFS from 'react-native-fs'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import { makeLog } from '@fedi/common/utils/log'
import { formatFileSize } from '@fedi/common/utils/media'

import { Images } from '../assets/images'
import { Column, Row } from '../components/ui/Flex'
import GradientView from '../components/ui/GradientView'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import SvgImage from '../components/ui/SvgImage'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'LocateSocialRecovery'
>

const log = makeLog('LocateSocialRecoveryScreen')

const LocateSocialRecovery: React.FC<Props> = ({ navigation }) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const fedimint = useFedimint()
    const toast = useToast()

    const [file, setFile] = useState<DocumentPickerResponse | undefined>()
    const [loading, setLoading] = useState<boolean>(false)

    const style = styles(theme)

    const handleFileUpload = async () => {
        try {
            setLoading(true)

            const files = await pick({
                type: types.allFiles,
                allowMultiSelection: false,
                allowVirtualFiles: true,
            })

            if (!files?.length) {
                log.info('No file selected')
                return
            }

            const selectedFile = files[0]
            log.info('File', selectedFile)

            setFile(selectedFile)
        } catch (error) {
            log.error('Social recovery file could not be uploaded', error)
            toast.show({
                content: t(
                    'feature.recovery.locate-social-recovery-file-upload-error',
                ),
                status: 'error',
            })
        } finally {
            setLoading(false)
        }
    }

    const handleProcessFile = async () => {
        if (!file) return

        setLoading(true)

        const dest = `${RNFS.DocumentDirectoryPath}/backup.fedi`

        try {
            // Remove existing file if it exists
            await RNFS.unlink(dest).catch(() => {})

            // Copy into the path Rust expects
            await RNFS.copyFile(file.uri, dest)

            // Ensure the file is valid
            await fedimint.validateRecoveryFile(dest)

            navigation.navigate('CompleteSocialRecovery')
        } catch (error) {
            log.error('Social recovery file could not be processed', error)
            toast.show({
                content: t(
                    'feature.recovery.locate-social-recovery-file-process-error',
                ),
                status: 'error',
            })
            setFile(undefined)
        } finally {
            setLoading(false)
        }
    }

    return (
        <SafeAreaContainer edges="bottom">
            <Column style={style.container}>
                <Column grow align="center" justify="start" gap="md">
                    <GradientView
                        variant="sky-banner"
                        style={style.iconWrapper}>
                        <Image
                            source={Images.SocialRecoveryFileIcon}
                            style={{ height: 40, width: 40 }}
                        />
                    </GradientView>
                    <Text h2 bold>
                        {t('feature.recovery.locate-social-recovery-title')}
                    </Text>
                    <Text style={style.instructionsText}>
                        {t(
                            'feature.recovery.locate-social-recovery-instructions',
                        )}
                    </Text>
                    {file && (
                        <Row
                            align="center"
                            justify="center"
                            gap="md"
                            style={style.uploadWrapper}>
                            <View style={style.fileIconWrapper}>
                                <SvgImage name="File" />
                            </View>
                            <View style={style.fileTextWrapper}>
                                <Text>{file.name}</Text>
                                {file?.size && (
                                    <Text
                                        small
                                        style={{
                                            color: theme.colors.darkGrey,
                                        }}>
                                        {formatFileSize(file.size)}
                                    </Text>
                                )}
                            </View>

                            <Pressable onPress={() => setFile(undefined)}>
                                <View style={style.closeIconWrapper}>
                                    <SvgImage name="Close" />
                                </View>
                            </Pressable>
                        </Row>
                    )}
                </Column>
                <Button
                    fullWidth
                    title={
                        !file
                            ? t(
                                  'feature.recovery.locate-social-recovery-button-label',
                              )
                            : t('words.submit')
                    }
                    onPress={!file ? handleFileUpload : handleProcessFile}
                    loading={loading}
                    disabled={loading}
                />
            </Column>
        </SafeAreaContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            padding: theme.spacing.xl,
        },
        instructionsText: {
            color: theme.colors.darkGrey,
            textAlign: 'center',
        },
        iconWrapper: {
            alignItems: 'center',
            borderRadius: 40,
            display: 'flex',
            justifyContent: 'center',
            height: 80,
            width: 80,
        },
        uploadWrapper: {
            borderRadius: theme.borders.defaultRadius,
            borderWidth: 1,
            borderColor: theme.colors.extraLightGrey,
            padding: theme.spacing.lg,
            width: '100%',
        },
        fileIconWrapper: {},
        fileTextWrapper: {
            flex: 1,
        },
        closeIconWrapper: {},
    })

export default LocateSocialRecovery
