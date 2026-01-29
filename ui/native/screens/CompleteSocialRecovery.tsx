import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import { completeSocialRecovery } from '@fedi/common/redux'
import type { GuardianApproval, SocialRecoveryEvent } from '@fedi/common/types'
import { makeLog } from '@fedi/common/utils/log'

import { Row, Column } from '../components/ui/Flex'
import GradientView from '../components/ui/GradientView'
import QRScreen from '../components/ui/QRScreen'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import SvgImage, { SvgImageSize } from '../components/ui/SvgImage'
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

    const style = styles(theme)

    useEffect(() => {
        const getRecoveryAssistCode = async () => {
            try {
                const recoveryAssistCode = await fedimint.recoveryQr()
                log.info('recoveryAssistCode', recoveryAssistCode)

                // add fedimint:recovery: prefix so that it can be parsed by Fedi app
                setRecoveryQrCode(
                    `fedimint:recovery:${JSON.stringify(recoveryAssistCode)}`,
                )
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
        }, 3000)

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
                    <Row
                        gap="sm"
                        justify="between"
                        align="center"
                        key={`gr-${i}`}>
                        <GradientView
                            variant="sky-banner"
                            style={style.userIconWrapper}>
                            <SvgImage name="User" size={SvgImageSize.xs} />
                        </GradientView>
                        <Text style={{ flex: 1 }}>{approval.guardianName}</Text>
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
        <SafeAreaContainer edges="bottom">
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={style.scrollContainer}>
                <Column
                    grow
                    align="center"
                    justify="start"
                    gap="sm"
                    style={style.container}>
                    <Text center h2 bold>
                        {t('feature.recovery.complete-social-recovery-title')}
                    </Text>
                    <Text center style={style.instructionsText}>
                        {t(
                            'feature.recovery.complete-social-recovery-description',
                        )}
                    </Text>
                    {recoveryQrCode ? (
                        <QRScreen
                            qrValue={recoveryQrCode}
                            copyMessage={t(
                                'feature.recovery.copied-recovery-code',
                            )}
                        />
                    ) : (
                        <ActivityIndicator />
                    )}
                    <View style={style.guardiansContainer}>
                        <Row justify="between">
                            <Text bold>
                                {t('feature.recovery.guardian-approvals')}
                                {'\n'}
                            </Text>
                            {renderGuardianApprovalStatus()}
                        </Row>
                        {renderGuardians()}
                    </View>
                </Column>
            </ScrollView>
            <View style={style.buttonContainer}>
                <Button
                    title={t('feature.recovery.complete-social-recovery')}
                    containerStyle={[styles(theme).completeButton]}
                    loading={recovering}
                    disabled={approvals?.remaining > 0}
                    onPress={() => setRecovering(true)}
                />
            </View>
        </SafeAreaContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        scrollContainer: {},
        container: {
            flex: 1,
            padding: theme.spacing.xl,
        },
        buttonContainer: {
            alignItems: 'center',
            padding: theme.spacing.lg,
            paddingTop: theme.spacing.md,
            width: '100%',
        },
        instructionsText: {
            color: theme.colors.darkGrey,
        },
        qrCodeContainer: {
            borderRadius: theme.borders.defaultRadius,
            borderWidth: 1,
            borderColor: theme.colors.lightGrey,
            padding: theme.spacing.lg,
        },
        userIconWrapper: {
            alignItems: 'center',
            borderRadius: '100%',
            display: 'flex',
            justifyContent: 'center',
            height: 34,
            width: 34,
        },
        completed: {
            color: theme.colors.success,
        },
        completeButton: {
            width: '100%',
            marginTop: 'auto',
        },
        guardiansContainer: {
            gap: theme.spacing.xs,
            width: '100%',
        },
        hidden: {
            opacity: 0,
        },
        openButton: {
            width: '100%',
        },
    })

export default CompleteSocialRecovery
