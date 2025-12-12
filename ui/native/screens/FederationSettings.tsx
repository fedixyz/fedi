import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, ScrollView, StyleSheet } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'

import { fedimint } from '../bridge'
import SettingsItem from '../components/feature/settings/SettingsItem'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'FederationSettings'
>

const FederationSettings: React.FC<Props> = ({ route }) => {
    const { federationId, federationName } = route.params
    const { t } = useTranslation()
    const { theme } = useTheme()
    const toast = useToast()

    const handleRepairWallet = async () => {
        try {
            await fedimint.repairWallet(federationId)
            toast.show({
                content: t('feature.settings.repair-wallet-success'),
                status: 'success',
            })
        } catch (e) {
            toast.show({
                content: t('feature.settings.repair-wallet-error'),
                status: 'error',
            })
        }
    }

    const handleRepairPressed = () => {
        Alert.alert(
            `${t('feature.settings.repair-wallet')} — ${federationName}`,
            t('feature.settings.repair-wallet-confirmation'),
            [
                {
                    text: t('words.no'),
                },
                {
                    text: t('words.yes'),
                    onPress: () => handleRepairWallet(),
                },
            ],
        )
    }

    const style = styles(theme)

    return (
        <ScrollView contentContainerStyle={style.container}>
            <SettingsItem
                icon="Settings"
                label={t('feature.settings.repair-wallet')}
                onPress={handleRepairPressed}
            />
            <Text
                caption
                bold
                color={theme.colors.darkGrey}
                style={style.description}>
                {t('feature.settings.repair-wallet-description')}
            </Text>
        </ScrollView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            justifyContent: 'flex-start',
            flexDirection: 'column',
            gap: theme.spacing.sm,
            paddingVertical: theme.spacing.md,
        },
        item: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
        },
        description: {
            paddingHorizontal: theme.spacing.lg,
        },
    })

export default FederationSettings
