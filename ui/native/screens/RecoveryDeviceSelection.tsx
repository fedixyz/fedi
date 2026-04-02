import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useDeviceRegistration } from '@fedi/common/hooks/recovery'
import { RpcRegisteredDevice } from '@fedi/common/types/bindings'
import { hexToRgba } from '@fedi/common/utils/color'
import { getFormattedDeviceInfo } from '@fedi/common/utils/device'

import { Column } from '../components/ui/Flex'
import SvgImage, { SvgImageSize } from '../components/ui/SvgImage'
import { reset } from '../state/navigation'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'RecoveryDeviceSelection'
>

const RecoveryDeviceSelection: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const {
        isLoadingRegisteredDevices,
        isProcessing,
        isResettingSeed,
        registeredDevices,
        handleContinueWithDefaultDevice,
        handleResetUnrecognizedSeed,
        handleTransfer,
    } = useDeviceRegistration(t)

    const style = styles(theme)

    const handleTryAgain = async () => {
        await handleResetUnrecognizedSeed(() => {
            navigation.dispatch(reset('ChooseRecoveryMethod'))
        })
    }

    const handleContinueAnyway = () => {
        handleContinueWithDefaultDevice(() => {
            navigation.dispatch(reset('TabsNavigator'))
        })
    }

    const selectDevice = (device: RpcRegisteredDevice) => {
        handleTransfer(device, () => {
            navigation.dispatch(reset('TabsNavigator'))
        })
    }

    const renderDevice = (device: RpcRegisteredDevice, index: number) => {
        const { deviceName, iconName, lastSeenAt } =
            getFormattedDeviceInfo(device)
        const lastSeen = `${t('phrases.last-seen')}: ${lastSeenAt}`

        return (
            <Pressable
                key={`di-${index}`}
                style={style.actionCardContainer}
                disabled={isProcessing}
                onPress={() => selectDevice(device)}>
                <Column center style={style.roundIconContainer}>
                    <SvgImage name={iconName} size={SvgImageSize.sm} />
                </Column>
                <Column
                    align="start"
                    gap="xxs"
                    style={style.actionCardTextContainer}>
                    <Text medium numberOfLines={1}>
                        {deviceName}
                    </Text>
                    <Text
                        small
                        numberOfLines={1}
                        style={{ color: theme.colors.darkGrey }}>
                        {lastSeen}
                    </Text>
                </Column>
                <View style={style.arrowContainer}>
                    {isProcessing ? (
                        <ActivityIndicator />
                    ) : (
                        <SvgImage name="ArrowRight" size={SvgImageSize.sm} />
                    )}
                </View>
            </Pressable>
        )
    }

    if (isLoadingRegisteredDevices) {
        return (
            <ScrollView contentContainerStyle={style.container}>
                <Column align="center" gap="lg" fullWidth>
                    <ActivityIndicator />
                </Column>
            </ScrollView>
        )
    }

    if (registeredDevices.length === 0) {
        return (
            <SafeAreaView
                style={style.safeAreaContainer}
                edges={{
                    left: 'additive',
                    right: 'additive',
                    bottom: 'maximum',
                }}>
                <Column grow center gap="lg" style={style.container}>
                    <Column
                        align="center"
                        gap="lg"
                        style={style.centeredContainer}>
                        <SvgImage name="Error" size={SvgImageSize.lg} />
                        <Text h2 medium style={style.title}>
                            {t('feature.recovery.device-not-found')}
                        </Text>
                        <Text center style={style.description}>
                            {t('feature.recovery.device-not-found-description')}
                        </Text>
                    </Column>
                    <Column fullWidth gap="md" style={style.bottomActions}>
                        <Button
                            title={t('phrases.start-over')}
                            onPress={handleTryAgain}
                            loading={isResettingSeed}
                            disabled={isProcessing}
                        />
                        <Button
                            type="outline"
                            title={t('feature.recovery.continue-anyways')}
                            onPress={handleContinueAnyway}
                            loading={isProcessing}
                            disabled={isResettingSeed}
                        />
                    </Column>
                </Column>
            </SafeAreaView>
        )
    }

    return (
        <ScrollView contentContainerStyle={style.container}>
            <Column align="center" gap="lg" fullWidth>
                <Text caption>
                    {t('feature.recovery.select-a-device-guidance')}
                </Text>
                {[...registeredDevices].map(renderDevice)}
            </Column>
            {/*
                // TODO: reenable once we've figured out a clear
                // way to communicate this
                <Button
                type="clear"
                title={t('feature.recovery.create-a-new-wallet-instead')}
                onPress={() => navigation.navigate('RecoveryNewWallet')}
            /> */}
            {/* TODO: build confirmation overlay */}
        </ScrollView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        safeAreaContainer: {
            flex: 1,
        },
        container: {
            flexGrow: 1,
            padding: theme.spacing.lg,
            gap: 24,
        },
        centeredContainer: {
            marginTop: 'auto',
            paddingHorizontal: theme.spacing.lg,
        },
        description: {
            color: theme.colors.darkGrey,
            lineHeight: 22,
        },
        bottomActions: {
            marginTop: 'auto',
        },
        actionCardContainer: {
            padding: theme.spacing.md,
            width: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: theme.colors.offWhite,
            borderRadius: 16,
            gap: 10,
        },
        roundIconContainer: {
            backgroundColor: theme.colors.secondary,
            height: 40,
            width: 40,
            borderRadius: 20,
            shadowOpacity: 1,
            shadowColor: hexToRgba(theme.colors.night, 0.1),
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 4 },
            elevation: 3,
        },
        actionCardTextContainer: {
            maxWidth: '70%',
        },
        title: {
            textAlign: 'center',
        },
        arrowContainer: { marginLeft: 'auto' },
    })

export default RecoveryDeviceSelection
