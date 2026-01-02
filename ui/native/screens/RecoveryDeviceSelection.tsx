import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native'

import { useDeviceRegistration } from '@fedi/common/hooks/recovery'
import { RpcRegisteredDevice } from '@fedi/common/types/bindings'
import { hexToRgba } from '@fedi/common/utils/color'
import { getFormattedDeviceInfo } from '@fedi/common/utils/device'

import Flex from '../components/ui/Flex'
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
    const { isProcessing, registeredDevices, handleTransfer } =
        useDeviceRegistration(t)

    const style = styles(theme)

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
                <Flex center style={style.roundIconContainer}>
                    <SvgImage name={iconName} size={SvgImageSize.sm} />
                </Flex>
                <Flex
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
                </Flex>
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

    return (
        <ScrollView contentContainerStyle={style.container}>
            <Flex align="center" gap="lg">
                <Text caption>
                    {t('feature.recovery.select-a-device-guidance')}
                </Text>
            </Flex>
            {registeredDevices.length === 0 ? (
                <Flex align="center" gap="lg" fullWidth>
                    <Text caption>
                        {t('feature.recovery.no-devices-found')}
                    </Text>
                </Flex>
            ) : (
                <Flex align="center" gap="lg" fullWidth>
                    {registeredDevices.map(renderDevice)}
                </Flex>
            )}
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
        container: {
            padding: theme.spacing.lg,
            gap: 24,
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
        arrowContainer: { marginLeft: 'auto' },
    })

export default RecoveryDeviceSelection
