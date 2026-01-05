import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Dimensions, Linking, StyleSheet } from 'react-native'
import { EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context'

import {
    useCameraPermission,
    useHasBottomTabsNavigation,
} from '../../../utils/hooks'
import { Column } from '../../ui/Flex'
import HoloCircle from '../../ui/HoloCircle'
import NightHoloGradient from '../../ui/NightHoloGradient'
import SvgImage from '../../ui/SvgImage'
import QrCodeScanner from '../scan/QrCodeScanner'
import { OmniActions } from './OmniActions'
import { OmniInputAction } from './OmniInput'

const { height } = Dimensions.get('screen')

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
        <Column grow gap="lg" basis={false} style={style.container}>
            <Column grow fullWidth basis={false} style={style.scanner}>
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
                        <Column
                            center
                            gap="lg"
                            fullWidth
                            style={style.permissionContent}>
                            <HoloCircle
                                size={72}
                                content={<SvgImage name="Scan" size={32} />}
                            />
                            <Text style={style.permissionText} medium>
                                {permissionView.title}
                            </Text>
                            <Button
                                day
                                style={style.continueButton}
                                fullWidth
                                onPress={permissionView.buttonOnPress}
                                title={
                                    <Text caption medium>
                                        {permissionView.buttonText}
                                    </Text>
                                }
                            />
                        </Column>
                    </NightHoloGradient>
                )}
            </Column>
            <OmniActions actions={actions} />
        </Column>
    )
}

const styles = (theme: Theme, insets: EdgeInsets) =>
    StyleSheet.create({
        container: {
            paddingTop: theme.spacing.lg,
            paddingLeft: theme.spacing.lg + (insets.left || 0),
            paddingRight: theme.spacing.lg + (insets.right || 0),
            paddingBottom: Math.max(theme.spacing.lg, insets.bottom || 0),
        },
        continueButton: {
            paddingLeft: theme.spacing.lg,
            paddingRight: theme.spacing.lg,
        },
        scanner: {
            borderRadius: 20,
            minHeight: height * 0.38, //ensure that on smaller screens we don't get a tiny rectangular window for the scanner.
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
            maxWidth: 260,
        },
        permissionText: {
            color: theme.colors.white,
            textAlign: 'center',
        },
    })
