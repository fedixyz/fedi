import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Input, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native'

import { theme as fediTheme } from '@fedi/common/constants/theme'
import {
    selectPaymentFederation,
    selectLoadedFederations,
} from '@fedi/common/redux'
import { isValidSupportTicketNumber } from '@fedi/common/utils/validation'

import FederationWalletSelector from '../components/feature/send/FederationWalletSelector'
import CustomOverlay from '../components/ui/CustomOverlay'
import { Row, Column } from '../components/ui/Flex'
import { SafeScrollArea } from '../components/ui/SafeArea'
import SvgImage from '../components/ui/SvgImage'
import { useAppSelector } from '../state/hooks'
import { RootStackParamList } from '../types/navigation'
import { useSubmitLogs } from '../utils/hooks/export'
import { useLaunchZendesk } from '../utils/hooks/support'

export type Props = NativeStackScreenProps<RootStackParamList, 'ShareLogs'>

const ShareLogs: React.FC<Props> = ({ navigation, route }) => {
    const initialTicketNumber = route?.params?.ticketNumber ?? ''

    const { t } = useTranslation()
    const { theme } = useTheme()

    const paymentFederation = useAppSelector(selectPaymentFederation)
    const federations = useAppSelector(selectLoadedFederations)

    const [isSelectingFederation, setIsSelectingFederation] = useState(false)
    const [ticketNumber, setTicketNumber] = useState(initialTicketNumber)
    const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false)
    const [dbTaps, setDbTaps] = useState(0)
    const [sendDb, setShouldSendDb] = useState(false)

    const { status, collectAttachmentsAndSubmit } = useSubmitLogs(
        paymentFederation?.id,
    )

    const { launchZendesk } = useLaunchZendesk()

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
        if (federations.length > 0 && !paymentFederation) {
            setIsSelectingFederation(true)
            return
        }
        if (!isValid) return
        const isSuccess = await collectAttachmentsAndSubmit(
            sendDb,
            ticketNumber,
        )
        if (isSuccess) {
            navigation.push('BugReportSuccess')
        }
    }, [
        ticketNumber,
        isValid,
        navigation,
        sendDb,
        collectAttachmentsAndSubmit,
        paymentFederation,
        federations,
    ])

    return (
        <SafeScrollArea edges="notop">
            <Column grow gap="lg" style={style.form}>
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
            </Column>
            <Column align="center" gap="lg" shrink={false}>
                <Column align="center">
                    <Pressable style={style.bugButton} onPress={handleBugPress}>
                        <Text>🪲</Text>
                    </Pressable>
                    <Text caption medium style={style.disclaimer}>
                        <Trans
                            i18nKey="feature.support.log-disclaimer"
                            components={{
                                anchor: (
                                    <Text
                                        caption
                                        medium
                                        style={[
                                            style.disclaimer,
                                            style.disclaimerLink,
                                        ]}
                                        onPress={() => launchZendesk()}
                                    />
                                ),
                            }}
                        />
                    </Text>
                </Column>
                {sendDb && (
                    <Row
                        align="center"
                        justify="between"
                        fullWidth
                        style={style.dbAttachedIndicator}>
                        <Text medium>
                            {t('feature.bug.database-attached')} 🕷️🐞🦟
                        </Text>
                        <SvgImage name="Check" />
                    </Row>
                )}
                <Button
                    fullWidth
                    disabled={isSubmitDisabled}
                    testID="submit"
                    title={
                        <Row center gap="sm">
                            {isSubmitDisabled && (
                                <ActivityIndicator
                                    size={18}
                                    color={submitTextColor}
                                />
                            )}
                            <Text medium caption color={submitTextColor}>
                                {submitText}
                            </Text>
                        </Row>
                    }
                    onPress={handleSubmit}
                />
            </Column>
            <CustomOverlay
                show={isSelectingFederation}
                onBackdropPress={() => setIsSelectingFederation(false)}
                contents={{
                    title: t('phrases.select-federation'),
                    description: t(
                        'feature.developer.select-federation-share-logs',
                    ),
                    body: <FederationWalletSelector fullWidth />,
                    buttons: [
                        {
                            text: t('words.continue'),
                            onPress: () => setIsSelectingFederation(false),
                            primary: true,
                        },
                    ],
                }}
            />
        </SafeScrollArea>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        scrollContainer: {
            flex: 1,
        },
        form: {
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
        disclaimer: {
            textAlign: 'center',
            maxWidth: 320,
            lineHeight: 20,
            color: theme.colors.grey,
        },
        disclaimerLink: {
            textDecorationLine: 'underline',
        },
        bugButton: {
            fontSize: 24,
            padding: 16,
            paddingBottom: 0,
        },
        dbAttachedIndicator: {
            backgroundColor: theme.colors.offWhite,
            padding: 12,
            borderRadius: 12,
        },
        descriptionInput: {
            textAlignVertical: 'top',
        },
    })

export default ShareLogs
