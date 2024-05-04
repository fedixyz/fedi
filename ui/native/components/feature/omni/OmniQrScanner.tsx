import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { View, StyleSheet } from 'react-native'
import { Linking } from 'react-native'
import { EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context'

import {
    useCameraPermission,
    useHasBottomTabsNavigation,
} from '../../../utils/hooks'
import NightHoloGradient from '../../ui/NightHoloGradient'
import SvgImage from '../../ui/SvgImage'
import QrCodeScanner from '../scan/QrCodeScanner'
import { OmniActions } from './OmniActions'
import { OmniInputAction } from './OmniInput'

interface Props {
    onInput(data: string): void
    actions: OmniInputAction[]
    isProcessing: boolean
}

export const OmniQrScanner: React.FC<Props> = ({
    onInput,
    actions,
    isProcessing,
}) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const insets = useSafeAreaInsets()
    const hasBottomTabs = useHasBottomTabsNavigation()
    const style = styles(
        theme,
        hasBottomTabs ? { ...insets, bottom: 0 } : insets,
    )
    const { cameraPermission, requestCameraPermission } = useCameraPermission()

    let permissionView:
        | undefined
        | {
              title: string
              buttonText: string
              buttonOnPress: () => void
          }
    if (cameraPermission === 'blocked') {
        permissionView = {
            title: t('feature.omni.camera-permission-denied'),
            buttonText: t('phrases.camera-settings'),
            buttonOnPress: () => Linking.openSettings(),
        }
    } else if (cameraPermission === 'denied') {
        permissionView = {
            title: t('feature.omni.camera-permission-request'),
            buttonText: t('words.continue'),
            buttonOnPress: requestCameraPermission,
        }
    }

    return (
        <View style={style.container}>
            <View style={style.scanner}>
                {cameraPermission === 'granted' && (
                    <QrCodeScanner
                        processing={isProcessing}
                        onQrCodeDetected={onInput}
                    />
                )}
                {permissionView && (
                    <NightHoloGradient
                        style={style.permissionContainer}
                        gradientStyle={style.permissionGradient}>
                        <View style={style.permissionContent}>
                            <SvgImage name="AllowCameraAccessIcon" size={72} />
                            <Text style={style.permissionText} medium>
                                {permissionView.title}
                            </Text>
                            <Button
                                day
                                fullWidth
                                onPress={permissionView.buttonOnPress}
                                title={
                                    <Text caption medium>
                                        {permissionView.buttonText}
                                    </Text>
                                }
                            />
                        </View>
                    </NightHoloGradient>
                )}
            </View>
            <OmniActions actions={actions} />
        </View>
    )
}

const styles = (theme: Theme, insets: EdgeInsets) =>
    StyleSheet.create({
        container: {
            flex: 1,
            flexDirection: 'column',
            gap: theme.spacing.lg,
            paddingTop: theme.spacing.lg,
            paddingLeft: theme.spacing.lg + (insets.left || 0),
            paddingRight: theme.spacing.lg + (insets.right || 0),
            paddingBottom: Math.max(theme.spacing.lg, insets.bottom || 0),
        },
        scanner: {
            flex: 1,
            width: '100%',
            borderRadius: 20,
            overflow: 'hidden',
            backgroundColor: theme.colors.extraLightGrey,
        },
        permissionContainer: {
            flex: 1,
            backgroundColor: theme.colors.primary,
        },
        permissionGradient: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
        },
        permissionContent: {
            width: '100%',
            maxWidth: 260,
            gap: theme.spacing.lg,
            justifyContent: 'center',
            alignItems: 'center',
        },
        permissionText: {
            color: theme.colors.white,
            textAlign: 'center',
        },
    })
