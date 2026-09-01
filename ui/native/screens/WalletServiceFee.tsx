import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import {
    DEFAULT_GUARDIAN_FEE_PPM,
    getWalletServiceRetryableError,
    guardianFeePpmToPercent,
    selectFiFormation,
    selectIsWalletServiceFormed,
    selectIsWalletServiceMaintenanceReady,
    setWalletServiceGuardianFee,
} from '@fedi/common/redux'
import { RpcFiOperationError } from '@fedi/common/types/bindings'
import { makeLog } from '@fedi/common/utils/log'

import {
    ServiceFeePicker,
    ServiceFeeSelection,
    formatFeePercent,
} from '../components/feature/walletservice/ServiceFeePicker'
import { WalletServiceScreenHeader } from '../components/feature/walletservice/WalletServiceScreenHeader'
import { Column } from '../components/ui/Flex'
import { SafeScrollArea } from '../components/ui/SafeArea'
import { WalletServiceFooter } from '../components/ui/WalletServiceFooter'
import { WarningBanner } from '../components/ui/WarningBanner'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('WalletServiceFee')

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'WalletServiceFee'
>

/** This screen is step 4 of the 5-step creation flow. */
const STEP_INDEX = 3

const WalletServiceFee: React.FC<Props> = ({ navigation, route }) => {
    const { mode } = route.params
    const { theme } = useTheme()
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const toast = useToast()
    const isFormed = useAppSelector(selectIsWalletServiceFormed)
    const isMaintenanceReady = useAppSelector(
        selectIsWalletServiceMaintenanceReady,
    )
    const guardianCount =
        useAppSelector(selectFiFormation)?.intent.federationSize ?? 0

    const [selection, setSelection] = useState<ServiceFeeSelection>({
        guardianFeePpm: DEFAULT_GUARDIAN_FEE_PPM,
        isValid: true,
    })
    const [isSaving, setIsSaving] = useState(false)

    const { guardianFeePpm } = selection
    // gate on live readiness, not the sticky isFormed: after an interrupted
    // formation resumes, the bridge is still reconciling and rejects the fee
    // with "already in progress" (#12005)
    const canSave = isMaintenanceReady && selection.isValid

    const handleSave = useCallback(async () => {
        setIsSaving(true)
        try {
            // the bridge only accepts a fee once the federation is formed, so
            // a rejection here is expected rather than exceptional
            await dispatch(
                setWalletServiceGuardianFee({ fedimint, guardianFeePpm }),
            ).unwrap()
            if (mode === 'onboarding') {
                navigation.navigate('WalletServiceLightningProvider')
            } else {
                // the settings entry confirms the change; onboarding just
                // moves on, as the prototype does
                toast.show(
                    t('feature.wallet-service.fee-saved', {
                        rate: formatFeePercent(
                            guardianFeePpmToPercent(guardianFeePpm),
                        ),
                    }),
                )
                navigation.goBack()
            }
        } catch (error) {
            log.error('setWalletServiceGuardianFee', error)
            toast.show({
                content: getWalletServiceRetryableError(
                    t,
                    (error as RpcFiOperationError | undefined)?.code,
                ),
                status: 'error',
            })
        } finally {
            setIsSaving(false)
        }
    }, [dispatch, fedimint, guardianFeePpm, mode, navigation, toast, t])

    const showPeerBadgeInfo = useCallback(
        () =>
            toast.show({
                content: t(
                    'feature.wallet-service.fee-breakdown-peerbadge-info',
                ),
                status: 'success',
            }),
        [toast, t],
    )

    const style = styles(theme)

    return (
        <>
            <WalletServiceScreenHeader
                backButton={mode === 'edit'}
                title={t(
                    mode === 'onboarding'
                        ? 'feature.wallet-service.fee-onboarding-title'
                        : 'feature.wallet-service.fee-title',
                )}
                step={mode === 'onboarding' ? STEP_INDEX : undefined}>
                {!isFormed ? (
                    <WarningBanner
                        message={t(
                            'feature.wallet-service.error-maintenance-wrong-state',
                        )}
                    />
                ) : !isMaintenanceReady ? (
                    // formed before, but the bridge is still reconciling that
                    // formation; the status stream removes this on its own
                    <WarningBanner
                        level="info"
                        message={t(
                            'feature.wallet-service.fee-finishing-setup',
                        )}
                    />
                ) : null}
            </WalletServiceScreenHeader>
            <SafeScrollArea edges="notop" padding="lg">
                <Column gap="lg" grow>
                    <ServiceFeePicker
                        guardianCount={guardianCount}
                        onChange={setSelection}
                        onInfoPress={showPeerBadgeInfo}
                    />
                </Column>
            </SafeScrollArea>

            {/* pinned, so the rate can be committed without scrolling past the
                custom field */}
            <WalletServiceFooter>
                <Button
                    fullWidth
                    testID="fee-save-button"
                    title={t(
                        mode === 'onboarding'
                            ? 'words.continue'
                            : 'feature.wallet-service.fee-save',
                    )}
                    onPress={handleSave}
                    disabled={!canSave}
                    // the design keeps the disabled CTA a readable ink pill
                    // at 40% opacity rather than the washed-out default
                    disabledStyle={style.ctaDisabled}
                    disabledTitleStyle={style.ctaDisabledTitle}
                    loading={isSaving}
                />
            </WalletServiceFooter>
        </>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        ctaDisabled: {
            backgroundColor: theme.colors.primary,
            opacity: 0.4,
        },
        ctaDisabledTitle: {
            color: theme.colors.white,
        },
    })

export default WalletServiceFee
