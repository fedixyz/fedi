import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import HoloCircle from '../components/ui/HoloCircle'
import LineBreak from '../components/ui/LineBreak'
import { getOsFromDeviceId } from '../utils/device-info'

const LockedDevice: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const deviceName = getOsFromDeviceId()

    const style = styles(theme)

    return (
        <View style={style.container}>
            <View style={style.headerContainer}>
                <HoloCircle content={<Text>{'🔒'}</Text>} size={64} />
                <Text h2 medium>
                    {t('feature.recovery.wallet-was-transferred')}
                </Text>
            </View>
            <Text medium style={style.centeredText}>
                {t('feature.recovery.locked-device-guidance-1')}
            </Text>
            <LineBreak />
            <Text medium style={style.centeredText}>
                <Trans
                    t={t}
                    i18nKey="feature.recovery.locked-device-guidance-2"
                    values={{ deviceName }}
                    components={{
                        bold: <Text bold />,
                    }}
                />
            </Text>
            <LineBreak />
            <Text medium style={style.centeredText}>
                {t('feature.recovery.locked-device-guidance-3')}
            </Text>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            justifyContent: 'center',
            padding: theme.spacing.xxl,
        },
        headerContainer: {
            alignItems: 'center',
            gap: 16,
            paddingBottom: theme.spacing.lg,
        },
        centeredText: {
            textAlign: 'center',
        },
    })

export default LockedDevice
