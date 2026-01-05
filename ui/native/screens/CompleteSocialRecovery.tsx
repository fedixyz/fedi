import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ActivityIndicator,
    Dimensions,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import { completeSocialRecovery } from '@fedi/common/redux'
import type { GuardianApproval, SocialRecoveryEvent } from '@fedi/common/types'
import { makeLog } from '@fedi/common/utils/log'

import { Row, Column } from '../components/ui/Flex'
import HoloCard from '../components/ui/HoloCard'
import QRCode from '../components/ui/QRCode'
import { useAppDispatch } from '../state/hooks'
import {
    resetAfterFailedSocialRecovery,
    resetAfterSocialRecovery,
} from '../state/navigation'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('CompleteSocialRecovery')

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'CompleteSocialRecovery'
>

const QR_CODE_SIZE = Dimensions.get('window').width * 0.7

const CompleteSocialRecovery: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const toast = useToast()
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const [recovering, setRecovering] = useState(false)

    const [approvals, setApprovals] = useState<SocialRecoveryEvent | undefined>(
        undefined,
    )
    const [recoveryQrCode, setRecoveryQrCode] = useState<string>('')

    useEffect(() => {
        const getRecoveryAssistCode = async () => {
            try {
                const recoveryAssistCode = await fedimint.recoveryQr()
                log.info('recoveryAssistCode', recoveryAssistCode)
                setRecoveryQrCode(JSON.stringify(recoveryAssistCode))
            } catch (error) {
                toast.error(t, error)
                navigation.dispatch(resetAfterFailedSocialRecovery())
            }
        }

        getRecoveryAssistCode()
    }, [navigation, toast, t, fedimint])

    // ask bridge for social recovery status every second
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                if (recovering === false && recoveryQrCode) {
                    const _approvals = await fedimint.socialRecoveryApprovals()
                    setApprovals(_approvals)
                }
            } catch (e) {
                toast.show({
                    content: t('errors.failed-to-fetch-guardian-approval'),
                    status: 'error',
                })
                log.error('failed to get approvals', e)
            }
        }, 1000)

        return () => clearInterval(interval)
    }, [toast, recovering, recoveryQrCode, setApprovals, t, fedimint])

    useEffect(() => {
        const completeRecovery = async () => {
            try {
                await dispatch(
                    completeSocialRecovery({
                        fedimint,
                    }),
                ).unwrap()
                setRecovering(false)
                navigation.dispatch(resetAfterSocialRecovery())
            } catch (error) {
                setRecovering(false)
                log.error('completeRecovery', error)
                toast.show({
                    content: t('errors.recovery-failed'),
                    status: 'error',
                })
            }
        }
        if (recovering) {
            completeRecovery()
        }
    }, [dispatch, navigation, recovering, toast, t, fedimint])

    const renderGuardianApprovalStatus = () => {
        if (approvals?.remaining === 0) {
            return <Text bold>{`(${t('words.complete')})`}</Text>
        } else {
            return (
                <Text bold>
                    {`(${approvals?.remaining} ${t('words.remaining')})`}
                </Text>
            )
        }
    }

    const renderGuardians = () => {
        return (
            approvals &&
            approvals.approvals.map((approval: GuardianApproval, i) => {
                return (
                    <Row justify="between" key={`gr-${i}`}>
                        <Text>{approval.guardianName}</Text>
                        <Text
                            style={
                                approval.approved ? styles(theme).completed : {}
                            }>
                            {approval.approved
                                ? t('words.approved')
                                : t('words.pending')}
                        </Text>
                    </Row>
                )
            })
        )
    }

    // Show loading indicator until we have approvals
    if (approvals == null) {
        return (
            <Column grow center>
                <ActivityIndicator size="large" />
            </Column>
        )
    }

    return (
        <ScrollView contentContainerStyle={styles(theme).container}>
            <Text style={styles(theme).instructionsText}>
                {t('feature.recovery.guardian-approval-instructions')}
            </Text>
            <HoloCard
                body={
                    recoveryQrCode ? (
                        <QRCode value={recoveryQrCode} size={QR_CODE_SIZE} />
                    ) : (
                        <ActivityIndicator />
                    )
                }
            />

            <View style={styles(theme).guardiansContainer}>
                <Row justify="between">
                    <Text bold>
                        {t('feature.recovery.guardian-approvals')}
                        {'\n'}
                    </Text>
                    {renderGuardianApprovalStatus()}
                </Row>
                {renderGuardians()}
            </View>
            <Button
                title={t('feature.recovery.complete-social-recovery')}
                containerStyle={[
                    styles(theme).completeButton,
                    approvals?.remaining > 0 ? styles(theme).hidden : {},
                ]}
                loading={recovering}
                onPress={() => setRecovering(true)}
            />
        </ScrollView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.xl,
        },
        completed: {
            color: theme.colors.success,
        },
        completeButton: {
            width: '100%',
            marginTop: 'auto',
        },
        guardiansContainer: {
            width: '100%',
            marginVertical: theme.spacing.xl,
        },
        hidden: {
            opacity: 0,
        },
        instructionsText: {
            textAlign: 'center',
            paddingHorizontal: theme.spacing.xl,
            marginBottom: theme.spacing.lg,
        },
        openButton: {
            width: '100%',
        },
    })

export default CompleteSocialRecovery
