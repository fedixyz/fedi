import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Linking, StyleSheet, View } from 'react-native'

import HoloCircle from '../components/ui/HoloCircle'
import LineBreak from '../components/ui/LineBreak'

const MigratedDeviceSuccess: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    const style = styles(theme)

    return (
        <View style={style.container}>
            <View style={style.headerContainer}>
                <HoloCircle content={<Text>{'✅'}</Text>} size={64} />
                <Text h2 medium style={style.centeredText}>
                    {t('feature.recovery.migrated-device-success-guidance-1')}
                </Text>
            </View>
            <LineBreak />
            <Text medium style={style.centeredText}>
                {t('feature.recovery.migrated-device-success-guidance-2')}
            </Text>
            <LineBreak />
            <Text medium style={style.centeredText}>
                <Trans
                    i18nKey="feature.recovery.migrated-device-success-guidance-3"
                    components={{
                        anchor: (
                            <Text
                                medium
                                style={[style.link]}
                                onPress={() =>
                                    Linking.openURL('https://support.fedi.xyz')
                                }
                            />
                        ),
                    }}
                />
            </Text>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            justifyContent: 'center',
            padding: theme.spacing.xl,
            marginBottom: theme.spacing.xxl,
        },
        headerContainer: {
            alignItems: 'center',
            gap: 16,
            paddingBottom: theme.spacing.lg,
        },
        centeredText: {
            textAlign: 'center',
        },
        link: {
            textDecorationLine: 'underline',
        },
    })

export default MigratedDeviceSuccess
