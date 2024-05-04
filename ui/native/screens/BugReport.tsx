import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Input, Switch, Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ActivityIndicator,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
    useWindowDimensions,
} from 'react-native'
import DeviceInfo from 'react-native-device-info'
import RNFS from 'react-native-fs'
import { Asset } from 'react-native-image-picker'
import { EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context'
import { v4 as uuidv4 } from 'uuid'

import { theme as fediTheme } from '@fedi/common/constants/theme'
import { useToast } from '@fedi/common/hooks/toast'
import {
    selectActiveFederation,
    selectAuthenticatedMember,
} from '@fedi/common/redux'
import {
    submitBugReport,
    uploadBugReportLogs,
} from '@fedi/common/utils/bug-report'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../bridge'
import { Attachments } from '../components/ui/Attachments'
import SvgImage from '../components/ui/SvgImage'
import { useAppSelector } from '../state/hooks'
import { RootStackParamList } from '../types/navigation'
import {
    attachmentsToFiles,
    generateLogsExportGzip,
} from '../utils/logs-export'

const log = makeLog('BugReport')

type Status =
    | 'idle'
    | 'generating-data'
    | 'uploading-data'
    | 'submitting-report'

export type Props = NativeStackScreenProps<RootStackParamList, 'BugReport'>

const BugReport: React.FC<Props> = ({ navigation }) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const insets = useSafeAreaInsets()
    const toast = useToast()
    const { fontScale } = useWindowDimensions()
    const activeFederation = useAppSelector(selectActiveFederation)
    const authenticatedMember = useAppSelector(selectAuthenticatedMember)
    const [description, setDescription] = useState('')
    const [isSendingUserInfo, setIsSendingUserInfo] = useState(true)
    const [email, setEmail] = useState('')
    const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false)
    const [status, setStatus] = useState<Status>('idle')
    const [attachments, setAttachments] = useState<Asset[]>([])
    const [dbTaps, setDbTaps] = useState(0)
    const [sendDb, setShouldSendDb] = useState(false)

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

    const style = styles(theme, insets, fontScale)
    const inputProps = {
        containerStyle: style.fieldContainerStyle,
        inputContainerStyle: style.fieldInputContainerStyle,
        inputStyle: style.fieldInputStyle,
        errorStyle: style.fieldErrorStyle,
        renderErrorMessage: false,
    }

    const isValid = !!description

    const handleBugPress = () => {
        const taps = dbTaps + 1
        setDbTaps(taps)

        if (taps > 21) {
            setShouldSendDb(!sendDb)
        }
    }

    const handleSubmit = async () => {
        setHasAttemptedSubmit(true)
        if (!isValid || !activeFederation) return
        try {
            const id = uuidv4()
            // Generate the logs export gzip
            setStatus('generating-data')
            const attachmentFiles = await attachmentsToFiles(attachments)

            if (sendDb) {
                const dumpedDbPath = await fedimint.dumpDb({
                    federationId: activeFederation.id,
                })
                const dumpBuffer = await RNFS.readFile(dumpedDbPath, 'base64')
                attachmentFiles.push({
                    name: 'db.dump',
                    content: dumpBuffer,
                })
            }
            const gzip = await generateLogsExportGzip(attachmentFiles)
            // Upload the logs export gzip to storage
            setStatus('uploading-data')
            await uploadBugReportLogs(id, gzip)
            // Submit bug report
            setStatus('submitting-report')
            await submitBugReport({
                id,
                description,
                email,
                federationName: isSendingUserInfo
                    ? activeFederation?.name || activeFederation?.id
                    : undefined,
                username: isSendingUserInfo
                    ? authenticatedMember?.username
                    : undefined,
                platform: `${DeviceInfo.getApplicationName()} (${Platform.OS})`,
                version: DeviceInfo.getVersion(),
            })
            // Success!
            navigation.push('BugReportSuccess')
        } catch (err) {
            log.error('Failed to submit bug report', err)
            toast.error(t, err)
            setStatus('idle')
        }
    }

    return (
        <ScrollView
            style={style.scrollContainer}
            contentContainerStyle={style.contentContainer}
            overScrollMode="auto">
            <View style={style.form}>
                <Input
                    {...inputProps}
                    label={
                        <Text caption medium style={style.fieldLabelStyle}>
                            {t('feature.bug.description-label')}
                        </Text>
                    }
                    placeholder={t('feature.bug.description-placeholder')}
                    value={description}
                    onChangeText={setDescription}
                    errorMessage={
                        hasAttemptedSubmit && !description
                            ? t('words.required')
                            : undefined
                    }
                    numberOfLines={6}
                    multiline
                    inputContainerStyle={[
                        inputProps.inputContainerStyle,
                        style.textareaContainerStyle,
                        hasAttemptedSubmit && !description
                            ? style.fieldInputContainerError
                            : undefined,
                    ]}
                />
                <View style={style.switchWrapper}>
                    <Text caption medium style={style.switchLabel}>
                        {t('feature.bug.info-label')}
                    </Text>
                    <Switch
                        value={isSendingUserInfo}
                        onValueChange={setIsSendingUserInfo}
                    />
                </View>
                <Input
                    {...inputProps}
                    label={
                        <Text caption medium style={style.fieldLabelStyle}>
                            {t('feature.bug.email-label')}
                        </Text>
                    }
                    placeholder={t('phrases.email-address')}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                />
                <View>
                    <Text caption medium style={style.fieldLabelStyle}>
                        {t('feature.bug.screenshot-label')}
                    </Text>
                    <View style={style.attachmentsContainer}>
                        <Attachments
                            options={{
                                // Low quality photos and videos to reduce payload size
                                mediaType: 'mixed',
                                maxWidth: 1024,
                                maxHeight: 1024,
                                quality: 0.7,
                                videoQuality: 'low',
                            }}
                            attachments={attachments}
                            setAttachments={setAttachments}
                            uploadButton
                        />
                    </View>
                </View>
            </View>
            <View style={style.actions}>
                <View style={style.bugContainer}>
                    <Pressable style={style.bugButton} onPress={handleBugPress}>
                        <Text>🪲</Text>
                    </Pressable>
                    <Text caption medium style={style.disclaimer}>
                        {t('feature.bug.log-disclaimer')}
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
        </ScrollView>
    )
}

const styles = (theme: Theme, insets: EdgeInsets, fontScale: number) =>
    StyleSheet.create({
        scrollContainer: {
            flex: 1,
        },
        contentContainer: {
            flexGrow: 1,
            paddingTop: theme.spacing.lg,
            paddingLeft: insets.left + theme.spacing.lg,
            paddingRight: insets.right + theme.spacing.lg,
            paddingBottom: Math.max(insets.bottom, theme.spacing.lg),
            gap: theme.spacing.lg,
        },
        container: {
            flex: 1,
            flexDirection: 'column',
        },
        form: {
            flex: 1,
            gap: theme.spacing.lg,
        },
        fieldContainerStyle: {
            height: 'auto',
            paddingHorizontal: 0,
        },
        textareaContainerStyle: {
            height: 140 * (1 + (fontScale - 1) * 0.5),
        },
        fieldInputContainerStyle: {
            flex: 1,
            alignItems: 'flex-start',
            justifyContent: 'flex-start',
            borderWidth: 1,
            borderColor: theme.colors.lightGrey,
            borderRadius: 8,
        },
        fieldInputContainerError: {
            borderColor: theme.colors.red,
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
        switchWrapper: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: theme.spacing.md,
            gap: theme.spacing.xl,
            backgroundColor: theme.colors.offWhite,
            borderRadius: 8,
        },
        switchLabel: {
            flex: 1,
            minWidth: 0,
            lineHeight: 20,
        },
        attachmentsContainer: {
            paddingTop: theme.spacing.xs,
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
        submitTitleText: {},
        disclaimer: {
            textAlign: 'center',
            maxWidth: 320,
            lineHeight: 20,
            color: theme.colors.grey,
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
    })

export default BugReport
