import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'

import { useDeviceRegistration } from '@fedi/common/hooks/recovery'
import { RpcRegisteredDevice } from '@fedi/common/types/bindings'
import { hexToRgba } from '@fedi/common/utils/color'

import { fedimint } from '../bridge'
import SvgImage, { SvgImageSize } from '../components/ui/SvgImage'
import { reset } from '../state/navigation'
import type { RootStackParamList } from '../types/navigation'
import { getFormattedDeviceInfo } from '../utils/device-info'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'RecoveryDeviceSelection'
>

const RecoveryDeviceSelection: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const { registeredDevices, handleTransfer } = useDeviceRegistration(
        t,
        fedimint,
    )

    const style = styles(theme)

    const selectDevice = (device: RpcRegisteredDevice) => {
        handleTransfer(device, hasSetDisplayName => {
            if (hasSetDisplayName) {
                navigation.dispatch(reset('TabsNavigator'))
            } else {
                navigation.dispatch(reset('EnterDisplayName'))
            }
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
                onPress={() => selectDevice(device)}>
                <View style={style.roundIconContainer}>
                    <SvgImage name={iconName} size={SvgImageSize.sm} />
                </View>
                <View style={style.actionCardTextContainer}>
                    <Text medium numberOfLines={1}>
                        {deviceName}
                    </Text>
                    <Text
                        small
                        numberOfLines={1}
                        style={{ color: theme.colors.darkGrey }}>
                        {lastSeen}
                    </Text>
                </View>
                <View style={style.arrowContainer}>
                    <SvgImage name="ArrowRight" size={SvgImageSize.sm} />
                </View>
            </Pressable>
        )
    }

    return (
        <ScrollView contentContainerStyle={style.container}>
            <View style={style.contentContainer}>
                <Text caption>
                    {t('feature.recovery.select-a-device-guidance')}
                </Text>
            </View>
            {registeredDevices.length === 0 ? (
                <View style={style.optionsContainer}>
                    <Text caption>
                        {t('feature.recovery.no-devices-found')}
                    </Text>
                </View>
            ) : (
                <View style={style.optionsContainer}>
                    {registeredDevices.map(renderDevice)}
                </View>
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
        contentContainer: {
            alignItems: 'center',
            gap: 16,
        },
        optionsContainer: { alignItems: 'center', width: '100%', gap: 16 },
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
            alignItems: 'center',
            justifyContent: 'center',
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
            alignItems: 'flex-start',
            gap: 2,
            maxWidth: '70%',
        },
        arrowContainer: { marginLeft: 'auto' },
    })

export default RecoveryDeviceSelection
