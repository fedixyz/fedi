import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Linking, StyleSheet } from 'react-native'

import { Column } from '../components/ui/Flex'
import HoloCircle from '../components/ui/HoloCircle'
import LineBreak from '../components/ui/LineBreak'

const MigratedDeviceSuccess: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    const style = styles(theme)

    return (
        <Column grow justify="center" style={style.container}>
            <Column align="center" gap="lg" style={style.headerContainer}>
                <HoloCircle content={<Text>{'✅'}</Text>} size={64} />
                <Text h2 medium style={style.centeredText}>
                    {t('feature.recovery.migrated-device-success-guidance-1')}
                </Text>
            </Column>
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
        </Column>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            padding: theme.spacing.xl,
            marginBottom: theme.spacing.xxl,
        },
        headerContainer: {
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
