import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Input, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'

import { theme as fediTheme } from '@fedi/common/constants/theme'
import { isValidSupportTicketNumber } from '@fedi/common/utils/validation'

import { SafeScrollArea } from '../components/ui/SafeArea'
import SvgImage from '../components/ui/SvgImage'
import { RootStackParamList } from '../types/navigation'
import { useShareLogs } from '../utils/hooks/export'

export type Props = NativeStackScreenProps<RootStackParamList, 'ShareLogs'>

const ShareLogs: React.FC<Props> = ({ navigation }) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const [ticketNumber, setTicketNumber] = useState('')
    const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false)
    const [dbTaps, setDbTaps] = useState(0)
    const [sendDb, setShouldSendDb] = useState(false)

    const { status, collectAttachmentsAndSubmit } = useShareLogs()

    const handleOpenSupport = useCallback(() => {
        navigation.navigate('FediModBrowser', {
            url: 'https://support.fedi.xyz',
        })
    }, [navigation])

    const isSubmitDisabled = status !== 'idle'
    const submitText =
        status === 'generating-data'
            ? t('feature.bug.submit-generating-data')
            : status === 'uploading-data'
              ? t('feature.bug.submit-uploading-data')
              : status === 'submitting-report'
                ? t('feature.bug.submit-submitting-report')
                : t('words.submit')
    const submitTextColor = isSubmitDisabled
        ? theme.colors.primary
        : theme.colors.white

    const style = styles(theme)
    const inputProps = {
        containerStyle: style.fieldContainerStyle,
        inputContainerStyle: style.fieldInputContainerStyle,
        inputStyle: style.fieldInputStyle,
        errorStyle: style.fieldErrorStyle,
        renderErrorMessage: false,
    }

    const isValid = isValidSupportTicketNumber(ticketNumber)

    const errorMessage = hasAttemptedSubmit
        ? !ticketNumber
            ? t('words.required')
            : !isValid
              ? t('feature.support.invalid-ticket-number')
              : undefined
        : undefined

    const handleBugPress = () => {
        const taps = dbTaps + 1
        setDbTaps(taps)

        if (taps > 21) {
            setShouldSendDb(!sendDb)
        }
    }

    const handleSubmit = useCallback(async () => {
        setHasAttemptedSubmit(true)
        if (!isValid) return
        const isSuccess = await collectAttachmentsAndSubmit(
            sendDb,
            ticketNumber,
        )
        if (isSuccess) {
            navigation.push('BugReportSuccess')
        }
    }, [ticketNumber, isValid, navigation, sendDb, collectAttachmentsAndSubmit])

    return (
        <SafeScrollArea edges="notop">
            <View style={style.form}>
                <Input
                    {...inputProps}
                    maxFontSizeMultiplier={1.6}
                    label={
                        <Text caption medium style={style.fieldLabelStyle}>
                            {t('feature.support.enter-ticket-number')}
                        </Text>
                    }
                    placeholder={t('feature.support.support-ticket-number')}
                    value={ticketNumber}
                    onChangeText={setTicketNumber}
                    keyboardType="numeric"
                    autoCapitalize="none"
                    errorMessage={errorMessage}
                />
            </View>
            <View style={style.actions}>
                <View style={style.bugContainer}>
                    <Pressable style={style.bugButton} onPress={handleBugPress}>
                        <Text>🪲</Text>
                    </Pressable>
                    <Text caption medium style={style.disclaimer}>
                        <Trans
                            i18nKey="feature.bug.log-disclaimer"
                            components={{
                                anchor: (
                                    <Text
                                        caption
                                        medium
                                        style={[
                                            style.disclaimer,
                                            style.disclaimerLink,
                                        ]}
                                        onPress={handleOpenSupport}
                                    />
                                ),
                            }}
                        />
                    </Text>
                </View>
                {sendDb && (
                    <View style={style.dbAttachedIndicator}>
                        <Text medium>
                            {t('feature.bug.database-attached')} 🕷️🐞🦟
                        </Text>
                        <SvgImage name="Check" />
                    </View>
                )}
                <Button
                    fullWidth
                    disabled={isSubmitDisabled}
                    title={
                        <View style={style.submitTitle}>
                            {isSubmitDisabled && (
                                <ActivityIndicator
                                    size={18}
                                    color={submitTextColor}
                                />
                            )}
                            <Text medium caption color={submitTextColor}>
                                {submitText}
                            </Text>
                        </View>
                    }
                    onPress={handleSubmit}
                />
            </View>
        </SafeScrollArea>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        scrollContainer: {
            flex: 1,
        },
        form: {
            flex: 1,
            gap: theme.spacing.lg,
            paddingTop: theme.spacing.lg,
        },
        fieldContainerStyle: {
            height: 'auto',
            paddingHorizontal: 0,
        },
        fieldInputContainerStyle: {
            flex: 1,
            alignItems: 'flex-start',
            justifyContent: 'flex-start',
            borderWidth: 1,
            borderColor: theme.colors.lightGrey,
            borderRadius: 8,
        },
        fieldInputStyle: {
            paddingTop: theme.spacing.md,
            padding: theme.spacing.md,
            height: '100%',
            fontSize: fediTheme.fontSizes.body,
            fontWeight: fediTheme.fontWeights.medium,
            lineHeight: 20,
        },
        fieldLabelStyle: {
            marginBottom: theme.spacing.sm,
        },
        fieldErrorStyle: {
            marginLeft: 0,
        },
        uploadButton: {
            padding: theme.spacing.md,
            backgroundColor: theme.colors.offWhite,
        },
        uploadButtonTitle: {
            marginLeft: theme.spacing.sm,
            color: theme.colors.primary,
        },
        actions: {
            flexShrink: 0,
            alignItems: 'center',
            gap: theme.spacing.lg,
        },
        submitTitle: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.sm,
        },
        disclaimer: {
            textAlign: 'center',
            maxWidth: 320,
            lineHeight: 20,
            color: theme.colors.grey,
        },
        disclaimerLink: {
            textDecorationLine: 'underline',
        },
        bugContainer: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
        },
        bugButton: {
            fontSize: 24,
            padding: 16,
            paddingBottom: 0,
        },
        dbAttachedIndicator: {
            backgroundColor: theme.colors.offWhite,
            padding: 12,
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderRadius: 12,
            width: '100%',
        },
        descriptionInput: {
            textAlignVertical: 'top',
        },
    })

export default ShareLogs
