import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated'

import { theme as fediTheme } from '@fedi/common/constants/theme'
import { useAmountFormatter } from '@fedi/common/hooks/amount'
import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import {
    WalletServiceCreationStage,
    authorizeWalletServicePayments,
    getWalletServiceErrorKey,
    getWalletServiceRetryableError,
    isTerminalWalletServiceError,
    selectFiClientError,
    selectFiLastErrorCode,
    selectFiPaymentRequirements,
    selectFiReplacementRequirements,
    selectFederationBalance,
    selectIsWalletServiceFormed,
    selectLoadedFederation,
    selectWalletServiceCreationProgress,
    selectWalletServiceGuardianProgress,
    selectWalletServicePaymentShortfall,
} from '@fedi/common/redux'
import { MSats } from '@fedi/common/types'
import { RpcFiOperationError } from '@fedi/common/types/bindings'
import { makeLog } from '@fedi/common/utils/log'

import { MilestoneRow } from '../components/feature/walletservice/MilestoneRow'
import TopUpSheet from '../components/feature/walletservice/TopUpSheet'
import { WalletServiceScreenHeader } from '../components/feature/walletservice/WalletServiceScreenHeader'
import ConfettiBurst from '../components/ui/ConfettiBurst'
import { Column, Row } from '../components/ui/Flex'
import { SafeAreaContainer, SafeScrollArea } from '../components/ui/SafeArea'
import {
    SUCCESS_PILL_GREEN,
    SUCCESS_PILL_GREEN_BG,
} from '../components/ui/SuccessPill'
import SvgImage from '../components/ui/SvgImage'
import { WalletServiceFooter } from '../components/ui/WalletServiceFooter'
import {
    WARNING_BANNER_AMBER,
    WarningBanner,
} from '../components/ui/WarningBanner'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { reset } from '../state/navigation'
import type { RootStackParamList } from '../types/navigation'
import { useDampedValue } from '../utils/hooks/dampedValue'

const log = makeLog('WalletServiceProgress')

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'WalletServiceProgress'
>

/**
 * Slow to alarm, slower to relax. Four seconds swallows any failure the driver
 * clears within its first backoffs; the longer clear and the floor together
 * stop a banner being pulled away from someone who has started reading it.
 */
const ERROR_DAMPING = {
    showAfterMs: 4_000,
    hideAfterMs: 1_500,
    minVisibleMs: 3_000,
}

const STAGES = [
    {
        stage: 1,
        labelKey: 'feature.wallet-service.stage-ecash-sent',
        detailKey: 'feature.wallet-service.stage-ecash-sent-detail',
    },
    {
        stage: 2,
        labelKey: 'feature.wallet-service.stage-guardians-confirmed',
        detailKey: 'feature.wallet-service.stage-guardians-confirmed-detail',
    },
    {
        stage: 3,
        labelKey: 'feature.wallet-service.stage-created',
        detailKey: 'feature.wallet-service.stage-created-detail',
    },
] as const satisfies ReadonlyArray<{
    stage: WalletServiceCreationStage
    labelKey: string
    detailKey: string
}>

const WalletServiceProgress: React.FC<Props> = ({ navigation }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const toast = useToast()
    const progress = useAppSelector(selectWalletServiceCreationProgress)
    const reportedErrorCode = useAppSelector(selectFiLastErrorCode)
    const paymentRequirements = useAppSelector(selectFiPaymentRequirements)
    const replacementRequirements = useAppSelector(
        selectFiReplacementRequirements,
    )
    const paymentShortfall = useAppSelector(selectWalletServicePaymentShortfall)
    const shortfallFederation = useAppSelector(s =>
        paymentShortfall
            ? selectLoadedFederation(s, paymentShortfall.federationId)
            : undefined,
    )
    // the wallet the parked authorization charges, for the approvable banner:
    // the proposal names the payer and what it holds even when it can cover
    // the total, so the user approves a spend from a wallet, not from thin air
    const approvalPayerId = paymentRequirements?.seats[0]?.paymentFederationId
    const approvalPayerFederation = useAppSelector(s =>
        approvalPayerId
            ? selectLoadedFederation(s, approvalPayerId)
            : undefined,
    )
    const approvalPayerBalance = useAppSelector(s =>
        approvalPayerId
            ? selectFederationBalance(s, approvalPayerId)
            : (0 as MSats),
    )
    const guardianProgress = useAppSelector(selectWalletServiceGuardianProgress)
    const clientError = useAppSelector(selectFiClientError)
    const [isAuthorizing, setIsAuthorizing] = useState(false)
    const [showTopUp, setShowTopUp] = useState(false)
    const [showConfetti, setShowConfetti] = useState(false)
    const hasCelebrated = useRef(false)
    const hasRoutedToReplacements = useRef(false)
    const readyPop = useSharedValue(0)
    const { makeFormattedAmountsFromMSats } = useAmountFormatter()

    /**
     * Done means formed, not merely created.
     *
     * `progress.isComplete` is the creation high-water mark — `phase ===
     * 'formed' || milestones.walletServiceCreated` — and the looser half of
     * that is what let the user leave this screen while the phase was still
     * `publishingSeatBindings`. The next screen is stricter: `WalletServiceFee`
     * cannot commit a rate until the federation is actually formed, so an early
     * exit landed on a fee screen carrying "That Wallet Service change isn't
     * possible right now." over a dead Save button.
     *
     * The fix is to not call it finished yet. Gating the *exit* alone was worse
     * than the problem: the screen threw its confetti, turned the heading green
     * and said Ready, and then held the one button that acts on any of that —
     * announcing success and refusing to leave in the same frame.
     *
     * So the last step simply stays unfinished until the phase agrees. The
     * final milestone keeps its spinner, the heading keeps saying the setup is
     * being created, the celebration fires once when it is genuinely over, and
     * Continue greys out exactly as it already does for every other stage. No
     * new waiting state, and nothing to take back.
     *
     * `selectIsWalletServiceFormed` is itself a high-water mark, so a driver
     * re-run that republishes an earlier phase cannot un-finish a screen that
     * has already finished.
     */
    const isFormed = useAppSelector(selectIsWalletServiceFormed)
    const isComplete = Boolean(progress?.isComplete) && isFormed
    const isTerminalError = isTerminalWalletServiceError(reportedErrorCode)

    // Nothing retries a terminal failure away, so delaying it only delays the
    // truth: it reports at once. Everything else is damped, because the driver
    // republishes `lastError` as null at the top of each attempt and the first
    // backoffs are a second apart — raw, that is a strobing banner.
    const dampedErrorCode = useDampedValue(
        isTerminalError ? null : reportedErrorCode,
        ERROR_DAMPING,
    )
    const visibleErrorCode = isTerminalError
        ? reportedErrorCode
        : dampedErrorCode

    // One voice per state, as the banner slot below is also one slot. A failing
    // attempt speaks quietly at first; if it goes on long enough to raise the
    // banner, the banner takes over and this falls silent. Both at once says
    // the same thing twice, in the same colour, in two places.
    //
    //   attempt fails      → quiet line
    //   still failing, 4s  → banner, line hidden
    //   recovers           → neither
    const isReconnecting =
        Boolean(reportedErrorCode) && !isTerminalError && !visibleErrorCode

    // formation is durable and the driver retries on its own, so leaving is
    // always safe; every non-complete state keeps this door open
    const handleClose = useCallback(() => {
        navigation.dispatch(
            reset('TabsNavigator', { initialRouteName: 'Home' }),
        )
    }, [navigation])

    // a parked guardian replacement is the user's decision to make, on its
    // own screen; route there once per parked action, and keep a banner here
    // as the way back in. Clearing re-arms the route: the bridge can re-park
    // a fresh action after a rejected apply, and that one deserves its own
    // hand-off too.
    useEffect(() => {
        if (!replacementRequirements) {
            hasRoutedToReplacements.current = false
            return
        }
        if (hasRoutedToReplacements.current) return
        hasRoutedToReplacements.current = true
        navigation.navigate('WalletServiceReplaceReview')
    }, [replacementRequirements, navigation])

    // fire the celebration exactly once when formation completes: the ready
    // mark pops in (prototype's readyPop curve) and confetti falls, then the
    // user leaves at their own pace via Continue
    useEffect(() => {
        if (!isComplete || hasCelebrated.current) return
        hasCelebrated.current = true
        readyPop.value = withTiming(1, {
            duration: 450,
            easing: Easing.bezier(0.34, 1.56, 0.64, 1),
        })
        setShowConfetti(true)
        const timer = setTimeout(() => setShowConfetti(false), 2600)
        return () => clearTimeout(timer)
    }, [isComplete, readyPop])

    const readyMarkStyle = useAnimatedStyle(() => ({
        opacity: readyPop.value,
        transform: [{ scale: 0.4 + 0.6 * readyPop.value }],
    }))

    const handleContinue = useCallback(() => {
        navigation.dispatch(reset('WalletServiceFee', { mode: 'onboarding' }))
    }, [navigation])

    const handleAuthorize = useCallback(async () => {
        if (!paymentRequirements) return
        setIsAuthorizing(true)
        try {
            // send the id the user saw, never a fresher one from state; a
            // stale id is rejected and the replacement re-parks the action
            await dispatch(
                authorizeWalletServicePayments({
                    fedimint,
                    authorizationId: paymentRequirements.authorizationId,
                }),
            ).unwrap()
        } catch (error) {
            log.error('authorizeWalletServicePayments', error)
            toast.show({
                content: getWalletServiceRetryableError(
                    t,
                    (error as RpcFiOperationError | undefined)?.code,
                ),
                status: 'error',
            })
        } finally {
            setIsAuthorizing(false)
        }
    }, [dispatch, fedimint, paymentRequirements, toast, t])

    const style = styles(theme)

    const clientErrorBanner = clientError ? (
        <WarningBanner
            level="error"
            icon="AlertWarningTriangleOutline"
            title={t('feature.wallet-service.client-error')}
            message={t(getWalletServiceErrorKey(clientError.code))}
        />
    ) : null

    // decision 20: one exit control for the whole flow, in one style. Secondary
    // rather than a text link, so it reads as a control the user may press and
    // not as a caption under the primary action
    const returnHomeButton = (
        <Button
            fullWidth
            outline
            testID="return-home-button"
            title={t('phrases.return-to-home')}
            onPress={handleClose}
        />
    )

    if (!progress) {
        return (
            <>
                <WalletServiceScreenHeader
                    title={t('feature.wallet-service.progress-title')}>
                    {clientErrorBanner}
                </WalletServiceScreenHeader>
                {!clientErrorBanner && (
                    <SafeAreaContainer
                        style={style.loadingContainer}
                        edges="notop"
                        padding="lg">
                        <ActivityIndicator />
                    </SafeAreaContainer>
                )}
                <WalletServiceFooter>{returnHomeButton}</WalletServiceFooter>
            </>
        )
    }

    const authorizationAmounts = paymentRequirements
        ? makeFormattedAmountsFromMSats(
              Number(paymentRequirements.totalMsats) as MSats,
          )
        : null

    // one status slot, by priority — a dead client beats everything, then a
    // decision the user owns, then an error, then plain status — plus an
    // optional shortfall banner attached to the approval state below
    const messageBanner = clientErrorBanner ? (
        clientErrorBanner
    ) : replacementRequirements ? (
        <WarningBanner
            level="warning"
            icon="AlertWarningTriangleOutline"
            title={t('feature.wallet-service.replace-title')}
            message={t('feature.wallet-service.replace-body')}
        />
    ) : paymentRequirements && authorizationAmounts ? (
        // approval and shortfall are one banner, not two stacked amber ones
        // repeating the same amount: when the payer wallet is short, the
        // blocker is the funds, so that is what the title names
        paymentShortfall && shortfallFederation ? (
            <WarningBanner
                level="warning"
                icon="AlertWarningTriangleOutline"
                title={t('feature.wallet-service.approval-shortfall-title')}
                message={t('feature.wallet-service.approval-shortfall-body', {
                    // sats throughout: the sentence compares what is owed,
                    // what the wallet holds and the gap, so the units match
                    amount: makeFormattedAmountsFromMSats(
                        Number(paymentRequirements.totalMsats) as MSats,
                    ).formattedSats,
                    federation: shortfallFederation.name,
                    available: makeFormattedAmountsFromMSats(
                        Number(
                            BigInt(paymentShortfall.requiredMsats) -
                                BigInt(paymentShortfall.shortfallMsats),
                        ) as MSats,
                    ).formattedSats,
                    gap: makeFormattedAmountsFromMSats(
                        Number(paymentShortfall.shortfallMsats) as MSats,
                    ).formattedSats,
                })}
            />
        ) : (
            <WarningBanner
                level="warning"
                icon="AlertWarningTriangleOutline"
                title={t('feature.wallet-service.approval-needed-title')}
                message={
                    approvalPayerFederation
                        ? t('feature.wallet-service.additional-payment-from', {
                              amount: authorizationAmounts.formattedPrimaryAmount,
                              sats: authorizationAmounts.formattedSecondaryAmount,
                              federation: approvalPayerFederation.name,
                              available:
                                  makeFormattedAmountsFromMSats(
                                      approvalPayerBalance,
                                  ).formattedSats,
                          })
                        : t('feature.wallet-service.additional-payment', {
                              amount: authorizationAmounts.formattedPrimaryAmount,
                          }) +
                          ` (${authorizationAmounts.formattedSecondaryAmount})`
                }
            />
        )
    ) : visibleErrorCode && isTerminalError ? (
        <WarningBanner
            level="error"
            icon="AlertWarningTriangleOutline"
            title={t('feature.wallet-service.setup-blocked-title')}
            message={t(getWalletServiceErrorKey(visibleErrorCode))}
        />
    ) : visibleErrorCode ? (
        <WarningBanner
            level="warning"
            icon="AlertWarningTriangleOutline"
            title={t('feature.wallet-service.temporary-problem-title')}
            message={`${t(getWalletServiceErrorKey(visibleErrorCode))} ${t(
                'feature.wallet-service.retrying-automatically',
            )}`}
        />
    ) : isComplete ? null : (
        <Text small color={theme.colors.darkGrey}>
            {t('feature.wallet-service.progress-notice')}
        </Text>
    )

    return (
        <>
            {/* no step dots: the user cannot navigate from this screen, so an
                indicator would imply a control that does not exist */}
            <WalletServiceScreenHeader
                title={t(
                    isComplete
                        ? 'feature.wallet-service.progress-ready-title'
                        : 'feature.wallet-service.progress-title',
                )}
                // the heading turns green on success, alongside the ready mark
                titleStyle={isComplete ? style.titleReady : undefined}>
                {messageBanner}
            </WalletServiceScreenHeader>
            <SafeScrollArea edges="notop" padding="lg">
                <Column gap="lg" grow>
                    {isComplete && (
                        <Animated.View
                            testID="ready-mark"
                            style={[style.readyMark, readyMarkStyle]}>
                            <SvgImage
                                name="Check"
                                size={44}
                                color={SUCCESS_PILL_GREEN}
                            />
                        </Animated.View>
                    )}

                    <Column gap="sm">
                        {STAGES.map(({ stage, labelKey, detailKey }) => (
                            <MilestoneRow
                                key={stage}
                                label={t(labelKey)}
                                detail={
                                    stage === 2 && guardianProgress
                                        ? t(
                                              'feature.wallet-service.guardians-confirmed-count',
                                              guardianProgress,
                                          )
                                        : t(detailKey)
                                }
                                testID={`milestone-${stage}`}
                                detailTestID={`stage-detail-${stage}`}
                                isDone={isComplete || progress.stage > stage}
                                isActive={
                                    !isComplete && progress.stage === stage
                                }
                            />
                        ))}
                    </Column>

                    {/* attempt health, kept apart from progress: a driver that
                        is retrying has not lost anything, so it gets a quiet
                        line rather than a banner that moves the page */}
                    {!isComplete && isReconnecting && (
                        <Row align="center" gap="sm" testID="reconnecting-note">
                            <View style={style.reconnectingDot} />
                            <Text style={style.reconnectingText}>
                                {t('feature.wallet-service.reconnecting')}
                            </Text>
                        </Row>
                    )}
                </Column>
            </SafeScrollArea>

            {/* pinned, so Continue and the recovery actions stay reachable
                while the milestone list grows.

                Two controls, in one arrangement: the commitment and the way
                out. Continue holds the primary slot from the first frame,
                greyed until there is something to continue to, so the shape of
                the screen never changes as the work proceeds. Only a decision
                the bridge has parked — an approval, a replacement — takes the
                slot away from it, and gives it straight back. */}
            <WalletServiceFooter>
                {replacementRequirements ? (
                    <Button
                        fullWidth
                        testID="review-replacements-button"
                        title={t('feature.wallet-service.review-replacements')}
                        onPress={() =>
                            navigation.navigate('WalletServiceReplaceReview')
                        }
                    />
                ) : paymentRequirements && authorizationAmounts ? (
                    paymentShortfall && shortfallFederation ? (
                        <Button
                            fullWidth
                            title={t('feature.wallet-service.top-up-button')}
                            onPress={() => setShowTopUp(true)}
                        />
                    ) : (
                        <Button
                            fullWidth
                            title={t('feature.wallet-service.approve-payment')}
                            onPress={handleAuthorize}
                            loading={isAuthorizing}
                        />
                    )
                ) : clientError || isTerminalError ? null : (
                    <Button
                        fullWidth
                        testID="continue-button"
                        title={t('words.continue')}
                        onPress={handleContinue}
                        disabled={!isComplete}
                        disabledStyle={style.continueDisabled}
                        disabledTitleStyle={style.continueDisabledTitle}
                    />
                )}
                {(clientError || !isComplete) && returnHomeButton}
            </WalletServiceFooter>

            {showConfetti && <ConfettiBurst />}

            {paymentShortfall && shortfallFederation && (
                <TopUpSheet
                    show={showTopUp}
                    onDismiss={() => setShowTopUp(false)}
                    onFunded={() => setShowTopUp(false)}
                    totalMsats={String(paymentShortfall.requiredMsats)}
                    availableMsats={String(
                        BigInt(paymentShortfall.requiredMsats) -
                            BigInt(paymentShortfall.shortfallMsats),
                    )}
                    payerFederationId={paymentShortfall.federationId}
                    payerFederationName={shortfallFederation.name}
                />
            )}
        </>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        continueDisabled: {
            backgroundColor: theme.colors.grey,
        },
        continueDisabledTitle: {
            color: theme.colors.white,
        },
        loadingContainer: {
            alignItems: 'center',
            justifyContent: 'center',
        },
        // the same amber the warning banner speaks in: this line and that
        // banner are the same message at two volumes, so they share a colour
        reconnectingDot: {
            backgroundColor: WARNING_BANNER_AMBER,
            borderRadius: 999,
            height: 6,
            width: 6,
        },
        reconnectingText: {
            color: WARNING_BANNER_AMBER,
            fontSize: fediTheme.fontSizes.small,
            lineHeight: 16,
        },
        readyMark: {
            alignItems: 'center',
            alignSelf: 'center',
            backgroundColor: SUCCESS_PILL_GREEN_BG,
            borderRadius: 999,
            height: 96,
            justifyContent: 'center',
            width: 96,
        },
        titleReady: {
            color: SUCCESS_PILL_GREEN,
        },
    })

export default WalletServiceProgress
