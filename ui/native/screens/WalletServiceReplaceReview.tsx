import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { theme as fediTheme } from '@fedi/common/constants/theme'
import { useAmountFormatter } from '@fedi/common/hooks/amount'
import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import {
    applyWalletServiceReplacements,
    getWalletServiceRetryableError,
    previewWalletServiceReplacements,
    selectFiReplacementRequirements,
    selectWalletServiceReplacementPreview,
} from '@fedi/common/redux'
import { MSats } from '@fedi/common/types'
import { RpcFiOperationError } from '@fedi/common/types/bindings'
import { makeLog } from '@fedi/common/utils/log'

import { AmountHeadline } from '../components/feature/walletservice/AmountHeadline'
import { WalletServiceScreenHeader } from '../components/feature/walletservice/WalletServiceScreenHeader'
import { Column, Row } from '../components/ui/Flex'
import { SafeAreaContainer, SafeScrollArea } from '../components/ui/SafeArea'
import { SummaryRow } from '../components/ui/SummaryRow'
import SvgImage from '../components/ui/SvgImage'
import { WalletServiceFooter } from '../components/ui/WalletServiceFooter'
import { WarningBanner } from '../components/ui/WarningBanner'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('WalletServiceReplaceReview')

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'WalletServiceReplaceReview'
>

/**
 * Review and approve replacement guardians for a formation whose seat was
 * terminally refused mid-setup.
 *
 * The progress screen only detects the parked `replaceGuardians` action and
 * routes here; the decision — who replaces the lost seat and at what price —
 * is this screen's single job, mirroring how the confirm screen owns the
 * original selection. The bridge exposes no `validUntil` for replacement
 * previews, so staleness is handled reactively: a rejected apply clears the
 * preview and this screen fetches a fresh one.
 */
const WalletServiceReplaceReview: React.FC<Props> = ({ navigation }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const toast = useToast()
    const requirements = useAppSelector(selectFiReplacementRequirements)
    const preview = useAppSelector(selectWalletServiceReplacementPreview)
    const [isApplying, setIsApplying] = useState(false)
    const [isPreviewing, setIsPreviewing] = useState(false)
    const [insufficientSeats, setInsufficientSeats] = useState<{
        requested: number
        selected: number
    } | null>(null)
    const { makeFormattedAmountsFromMSats } = useAmountFormatter()

    const fetchPreview = useCallback(async () => {
        setIsPreviewing(true)
        setInsufficientSeats(null)
        try {
            await dispatch(
                previewWalletServiceReplacements({ fedimint }),
            ).unwrap()
        } catch (error) {
            log.error('previewWalletServiceReplacements', error)
            const opError = error as RpcFiOperationError | undefined
            // no candidates is a waiting state, not a failure: the formation
            // is durable, so the honest offer is "check back soon"
            if (opError?.detail?.type === 'insufficientFmanSeats') {
                setInsufficientSeats({
                    requested: opError.detail.requested,
                    selected: opError.detail.selected,
                })
                return
            }
            toast.show({
                content: getWalletServiceRetryableError(t, opError?.code),
                status: 'error',
            })
        } finally {
            setIsPreviewing(false)
        }
    }, [dispatch, fedimint, toast, t])

    useEffect(() => {
        // the parked action can clear while this screen is open (another
        // device resolved it); with nothing left to review, leave quietly
        if (!requirements) {
            navigation.goBack()
            return
        }
        if (!preview && !isPreviewing && !insufficientSeats) fetchPreview()
    }, [
        requirements,
        preview,
        isPreviewing,
        insufficientSeats,
        fetchPreview,
        navigation,
    ])

    const handleApprove = useCallback(async () => {
        if (!preview) return
        setIsApplying(true)
        try {
            // cap at the exact total on screen, never a fresher one
            await dispatch(
                applyWalletServiceReplacements({
                    fedimint,
                    previewId: preview.previewId,
                    maxTotalMsats: preview.totalAdvertisedMsats,
                }),
            ).unwrap()
            // leave immediately rather than waiting for the status stream to
            // clear the parked action; the requirements effect would refetch
            // a pointless preview in that gap
            navigation.goBack()
        } catch (error) {
            log.error('applyWalletServiceReplacements', error)
            toast.show({
                content: getWalletServiceRetryableError(
                    t,
                    (error as RpcFiOperationError | undefined)?.code,
                ),
                status: 'error',
            })
            // the reducer dropped the rejected preview; the mount effect
            // fetches a fresh subset on the next render
        } finally {
            setIsApplying(false)
        }
    }, [dispatch, fedimint, preview, navigation, toast, t])

    const style = styles(theme)

    // decision 20: the same exit control, in the same secondary style, as the
    // progress screen
    const returnHomeButton = (
        <Button
            fullWidth
            outline
            testID="return-home-button"
            title={t('phrases.return-to-home')}
            onPress={() => navigation.goBack()}
        />
    )

    if (insufficientSeats) {
        return (
            <>
                <WalletServiceScreenHeader
                    backButton
                    title={t('feature.wallet-service.replace-review-title')}>
                    <WarningBanner
                        level="warning"
                        icon="AlertWarningTriangleOutline"
                        title={t('feature.wallet-service.not-enough-title')}
                        message={t(
                            'feature.wallet-service.replace-not-found',
                            insufficientSeats,
                        )}
                    />
                </WalletServiceScreenHeader>
                {/* nothing to show between banner and actions, but the actions
                    still belong at the bottom like every other step — without
                    this spacer the footer rides up under the banner */}
                <View style={style.footerSpacer} />
                <WalletServiceFooter>
                    <Button
                        fullWidth
                        title={t('words.retry')}
                        loading={isPreviewing}
                        onPress={fetchPreview}
                    />
                    {returnHomeButton}
                </WalletServiceFooter>
            </>
        )
    }

    if (!preview) {
        return (
            <>
                <WalletServiceScreenHeader
                    backButton
                    title={t('feature.wallet-service.replace-review-title')}
                />
                <SafeAreaContainer
                    style={style.loadingContainer}
                    edges="notop"
                    padding="lg">
                    <ActivityIndicator />
                    <Text caption color={theme.colors.darkGrey}>
                        {t('feature.wallet-service.replace-searching')}
                    </Text>
                </SafeAreaContainer>
                <WalletServiceFooter>{returnHomeButton}</WalletServiceFooter>
            </>
        )
    }

    const totalMsats = Number(preview.totalAdvertisedMsats) as MSats
    const { formattedFiat } = makeFormattedAmountsFromMSats(totalMsats)
    const { formattedSats: totalSatsNumber } = makeFormattedAmountsFromMSats(
        totalMsats,
        'none',
    )

    return (
        <>
            <WalletServiceScreenHeader
                backButton
                title={t('feature.wallet-service.replace-review-title')}>
                <WarningBanner
                    level="warning"
                    icon="AlertWarningTriangleOutline"
                    title={t('feature.wallet-service.replace-cause-title')}
                    message={t('feature.wallet-service.replace-cause-body')}
                />
            </WalletServiceScreenHeader>
            <SafeScrollArea edges="notop" padding="lg">
                <Column gap="lg" grow>
                    <Column gap="sm">
                        {preview.seats.map(seat => (
                            <Row
                                key={seat.index}
                                align="center"
                                gap="md"
                                style={style.seatCard}>
                                <SvgImage
                                    name="SocialPeople"
                                    size={20}
                                    color={theme.colors.primary}
                                />
                                <Column gap="xxs" grow shrink>
                                    <Text style={style.seatLabel}>
                                        {t(
                                            'feature.wallet-service.seat-index',
                                            {
                                                index: seat.index + 1,
                                            },
                                        )}
                                    </Text>
                                    <Text style={style.seatDetail}>
                                        {t(
                                            'feature.wallet-service.seat-verified',
                                        )}
                                    </Text>
                                </Column>
                                <Text style={style.seatPrice}>
                                    {
                                        makeFormattedAmountsFromMSats(
                                            Number(
                                                seat.advertisedPriceMsats,
                                            ) as MSats,
                                        ).formattedSats
                                    }
                                </Text>
                            </Row>
                        ))}
                    </Column>

                    <Column align="center" justify="center" gap="xs" grow>
                        <AmountHeadline
                            satsNumber={totalSatsNumber}
                            fiat={formattedFiat}
                            testID="replacement-cost"
                        />
                        <Text small color={theme.colors.darkGrey}>
                            {t('feature.wallet-service.replace-cost-note')}
                        </Text>
                    </Column>
                </Column>
            </SafeScrollArea>

            {/* pinned above the action bar, matching the confirm screen */}
            <View style={style.summary}>
                <SummaryRow
                    isFirst
                    isEmphasised
                    label={t('feature.send.send-to')}
                    value={`${preview.seats.length} ${t(
                        'feature.wallet-service.guardians-label',
                    ).toLowerCase()}`}
                />
            </View>

            <WalletServiceFooter>
                <Button
                    fullWidth
                    testID="approve-replacements-button"
                    title={t('feature.wallet-service.approve-replacements')}
                    loading={isApplying}
                    onPress={handleApprove}
                />
            </WalletServiceFooter>
        </>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        footerSpacer: {
            flex: 1,
        },
        loadingContainer: {
            alignItems: 'center',
            gap: theme.spacing.md,
            justifyContent: 'center',
        },
        seatCard: {
            backgroundColor: '#FAFAFA',
            borderColor: theme.colors.dividerGrey,
            borderRadius: 14,
            borderWidth: 1,
            padding: 14,
        },
        seatDetail: {
            color: theme.colors.darkGrey,
            fontSize: fediTheme.fontSizes.small,
            lineHeight: 16,
        },
        seatLabel: {
            color: theme.colors.primary,
            fontSize: fediTheme.fontSizes.caption,
            fontWeight: '600',
            lineHeight: 18,
        },
        seatPrice: {
            color: theme.colors.primary,
            fontSize: fediTheme.fontSizes.caption,
            fontWeight: '600',
        },
        summary: {
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.sm,
        },
    })

export default WalletServiceReplaceReview
