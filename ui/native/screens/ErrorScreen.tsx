import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ErrorFallbackProps } from '@fedi/common/components/ErrorBoundary'
import { formatErrorMessage } from '@fedi/common/utils/format'
import { makeLog } from '@fedi/common/utils/log'

import SvgImage, { SvgImageSize } from '../components/ui/SvgImage'
import { version } from '../package.json'
import { shareLogsExport } from '../utils/log'

const log = makeLog('ErrorScreen')

type Props = Pick<ErrorFallbackProps, 'error'>

export const ErrorScreen: React.FC<Props> = ({ error }) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const style = styles(theme)
    const [isSharingLogs, setIsSharingLogs] = useState(false)

    const handleShareLogs = async () => {
        setIsSharingLogs(true)
        try {
            await shareLogsExport()
        } catch (err) {
            log.error('handleShareLogs', err)
        }
        setIsSharingLogs(false)
    }

    const stack: Error['stack'] = (error as Error)?.stack

    return (
        <SafeAreaView style={style.container}>
            <SvgImage name="Error" size={SvgImageSize.lg} />
            <Text h2 style={style.title}>
                {t('errors.please-force-quit-the-app')}
            </Text>
            <ScrollView
                style={style.messageContainer}
                contentContainerStyle={style.messageContent}>
                <Text style={style.message}>
                    {stack ||
                        formatErrorMessage(t, error, 'errors.unknown-error')}
                </Text>
            </ScrollView>
            <Button
                fullWidth
                onPress={handleShareLogs}
                title={t('feature.developer.share-logs')}
                loading={isSharingLogs}
            />
            <Text caption style={style.version}>
                Version {version}
            </Text>
        </SafeAreaView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            gap: theme.spacing.lg,
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.xl,
            backgroundColor: theme.colors.background,
        },
        title: {
            textAlign: 'center',
        },
        messageContainer: {
            width: '100%',
            marginTop: theme.spacing.md,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: `rgba(0, 0, 0, 0.12)`,
            backgroundColor: `rgba(0, 0, 0, 0.04)`,
        },
        messageContent: {
            padding: theme.spacing.md,
        },
        message: {
            color: theme.colors.red,
        },
        version: {
            color: theme.colors.grey,
            textAlign: 'center',
        },
    })
