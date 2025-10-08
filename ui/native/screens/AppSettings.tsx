import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Switch, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import {
    selectAnalyticsConsent,
    submitAnalyticsConsent,
} from '@fedi/common/redux/analytics'

import Flex from '../components/ui/Flex'
import SvgImage from '../components/ui/SvgImage'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'AppSettings'>

const AppSettings: React.FC<Props> = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const consent = useAppSelector(selectAnalyticsConsent) ?? false
    const [isSubmitting, setIsSubmitting] = useState(false)
    const dispatch = useAppDispatch()
    const toast = useToast()

    const handleConsentChange = useCallback(async () => {
        if (isSubmitting) return
        setIsSubmitting(true)

        try {
            await dispatch(
                submitAnalyticsConsent({
                    consent: !consent,
                    voteMethod: 'settings-update',
                }),
            ).unwrap()
        } catch (e) {
            toast.show({
                content: t('feature.settings.analytics-updated-error'),
                status: 'error',
            })
        } finally {
            setIsSubmitting(false)
        }
    }, [consent, dispatch, isSubmitting, t, toast])

    const style = styles(theme)

    return (
        <ScrollView contentContainerStyle={style.container}>
            <Flex row align="center" justify="between" style={style.item}>
                <Flex row align="center" gap="sm">
                    <SvgImage name="Settings" size={24} />
                    <Text>{t('feature.settings.usage-sharing')}</Text>
                </Flex>
                <Switch
                    value={consent}
                    disabled={isSubmitting}
                    onChange={handleConsentChange}
                />
            </Flex>
        </ScrollView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            justifyContent: 'flex-start',
            padding: theme.spacing.xl,
            flexDirection: 'column',
            gap: 24,
        },
        item: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
        },
    })

export default AppSettings
