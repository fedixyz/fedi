import { useFocusEffect } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { theme as fediTheme } from '@fedi/common/constants/theme'
import { useAmountFormatter } from '@fedi/common/hooks/amount'
import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import {
    RECOMMENDED_WALLET_SERVICE_SIZE,
    WALLET_SERVICE_SIZE_OPTIONS,
    clearWalletServiceSelectionPreview,
    getWalletServiceRetryableError,
    prepareWalletServicePayment,
    selectWalletServiceSelectionPreview,
    setWalletServiceDraft,
    walletServiceFaultTolerance,
} from '@fedi/common/redux'
import { MSats } from '@fedi/common/types'
import {
    RpcFiOperationError,
    RpcFiSelectionPreviewSeat,
} from '@fedi/common/types/bindings'
import { makeLog } from '@fedi/common/utils/log'

import { GuardianSeatsSkeleton } from '../components/feature/walletservice/GuardianSeatsSkeleton'
import { MilestoneSpinner } from '../components/feature/walletservice/MilestoneSpinner'
import { WalletServiceScreenHeader } from '../components/feature/walletservice/WalletServiceScreenHeader'
import CustomOverlay from '../components/ui/CustomOverlay'
import { Eyebrow } from '../components/ui/Eyebrow'
import { Column, Row } from '../components/ui/Flex'
import HelpTooltip from '../components/ui/HelpTooltip'
import { Pressable } from '../components/ui/Pressable'
import { PressableIcon } from '../components/ui/PressableIcon'
import { SafeScrollArea } from '../components/ui/SafeArea'
import { ScreenTitle } from '../components/ui/ScreenTitle'
import { SheetHandle } from '../components/ui/SheetHandle'
import { Skeleton } from '../components/ui/Skeleton'
import { SuccessPill } from '../components/ui/SuccessPill'
import { SummaryRow } from '../components/ui/SummaryRow'
import SvgImage from '../components/ui/SvgImage'
import { Switcher } from '../components/ui/Switcher'
import { WalletServiceFooter } from '../components/ui/WalletServiceFooter'
import { WarningBanner } from '../components/ui/WarningBanner'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'
import { useWalletServiceEntryGuard } from '../utils/hooks/walletServiceEntryGuard'

const log = makeLog('CreateWalletService')

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'CreateWalletService'
>

/**
 * One window covers a walk across several presets, so stepping 7 → 10 → 13
 * costs a single selection round trip instead of three.
 */
const PREVIEW_DEBOUNCE_MS = 350

/** This screen is step 1 of the creation flow. */
const STEP_INDEX = 0

/** Filled surface behind the disclosure, a shade off the page white. */
const DETAILS_CARD_BG = '#FAFAFA'

/**
 * Product copy for each guardian count, taken verbatim from the prototype's
 * `GUARDIAN_SCALE`. More guardians is more resilient but a smaller share each,
 * so revenue runs the opposite way. Every preset has its own rung — do not
 * collapse these into ranges.
 */
const GUARDIAN_SCALE = {
    7: { resilience: 'resilience-basic', revenue: 'revenue-highest' },
    10: { resilience: 'resilience-balanced', revenue: 'revenue-high' },
    13: { resilience: 'resilience-strong', revenue: 'revenue-medium' },
    16: { resilience: 'resilience-very-strong', revenue: 'revenue-lower' },
    19: { resilience: 'resilience-maximum', revenue: 'revenue-lowest' },
} as const

const scaleFor = (size: number) =>
    GUARDIAN_SCALE[size as keyof typeof GUARDIAN_SCALE] ?? GUARDIAN_SCALE[10]

/** Two-letter monogram standing in for the avatar the contract cannot supply. */
const initialsFor = (fmanId: string) =>
    fmanId
        .replace(/[^a-z0-9]/gi, '')
        .slice(0, 2)
        .toUpperCase()

/**
 * What to call a guardian in the set list.
 *
 * The bridge gained a two-word `fmanName` in `58d298e91`, but that commit sits
 * on `shaurya/fi-client-init` and carries a manifold pin bump (`0b2e2c0a` →
 * `b1f4e610`), so it is not on this branch and not on the type yet. The cast is
 * the shim: today the field is absent at runtime and this returns the id, and
 * the moment the stack rebases it starts returning real names with no further
 * change here.
 *
 * The id stays the fallback rather than a placeholder because names are not
 * unique — the bridge doc says they "can collide and never substitute for the
 * id" — so the id is the only identity that always means one guardian.
 *
 * Delete the cast once `fmanName` is on `RpcFiSelectionPreviewSeat`.
 */
const seatDisplayName = (seat: RpcFiSelectionPreviewSeat) =>
    (seat as RpcFiSelectionPreviewSeat & { fmanName?: string }).fmanName ||
    seat.fmanId

const CreateWalletService: React.FC<Props> = ({ navigation }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const toast = useToast()
    const { makeFormattedAmountsFromMSats } = useAmountFormatter()
    const preview = useAppSelector(selectWalletServiceSelectionPreview)
    const isRoutingAway = useWalletServiceEntryGuard()

    const [size, setSize] = useState(RECOMMENDED_WALLET_SERVICE_SIZE)
    // a preview is scheduled from the first render, so the summary starts in
    // its loading shape rather than flashing an empty one
    const [isPreviewing, setIsPreviewing] = useState(true)
    const [previewError, setPreviewError] =
        useState<RpcFiOperationError | null>(null)
    const [isDetailsOpen, setIsDetailsOpen] = useState(false)
    const [isConfirming, setIsConfirming] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    // the bridge call cannot be aborted, so a response that lands after the
    // user has backed out is dropped instead: no state update, no toast
    const isFocusedRef = useRef(true)

    const setSizeAndQuote = useCallback(
        async (nextSize: number) => {
            setIsPreviewing(true)
            dispatch(setWalletServiceDraft({ size: nextSize }))
            try {
                await dispatch(
                    prepareWalletServicePayment({ fedimint }),
                ).unwrap()
                if (!isFocusedRef.current) return
                setPreviewError(null)
            } catch (error) {
                if (!isFocusedRef.current) return
                log.error('prepareWalletServicePayment', error)
                const opError = error as RpcFiOperationError | undefined
                setPreviewError(opError ?? null)
                // too few guardians is answered by picking a smaller set, which
                // the banner says beside the presets; a toast would scroll away
                if (opError?.detail?.type !== 'insufficientFmanSeats') {
                    toast.show({
                        content: getWalletServiceRetryableError(
                            t,
                            opError?.code,
                        ),
                        status: 'error',
                    })
                }
            } finally {
                if (isFocusedRef.current) setIsPreviewing(false)
            }
        },
        [dispatch, fedimint, toast, t],
    )

    // the quote this screen left behind is stale the moment it returns, so
    // every focus drops it and shows the loader until a fresh one lands
    // (stable deps: this must not re-run when the count changes)
    useFocusEffect(
        useCallback(() => {
            isFocusedRef.current = true
            setIsPreviewing(true)
            setPreviewError(null)
            dispatch(clearWalletServiceSelectionPreview())
            return () => {
                isFocusedRef.current = false
            }
        }, [dispatch]),
    )

    // runs on every focus, not just mount, so returning from a later step
    // always lands on a fresh quote rather than the one it left behind
    useFocusEffect(
        useCallback(() => {
            // a live formation makes the bridge reject this as `busy`, and the
            // guard is already navigating away from it
            if (isRoutingAway) return
            const timeout = setTimeout(
                () => void setSizeAndQuote(size),
                PREVIEW_DEBOUNCE_MS,
            )
            return () => clearTimeout(timeout)
        }, [size, setSizeAndQuote, isRoutingAway]),
    )

    const insufficientSeatsDetail =
        previewError?.detail?.type === 'insufficientFmanSeats'
            ? previewError.detail
            : null
    // the count is locked while a search runs, so a mismatched quote should
    // not happen — the selected check stays as a belt-and-braces dim
    const isSummaryStale =
        isPreviewing || (preview !== null && preview.selected !== size)
    const scale = scaleFor(size)
    const totalAmounts = preview
        ? makeFormattedAmountsFromMSats(
              Number(preview.totalAdvertisedMsats) as MSats,
          )
        : null
    const canContinue =
        Boolean(preview) && !insufficientSeatsDetail && !isSubmitting

    const handleConfirm = useCallback(async () => {
        setIsSubmitting(true)
        dispatch(setWalletServiceDraft({ size }))
        try {
            await dispatch(prepareWalletServicePayment({ fedimint })).unwrap()
            setIsConfirming(false)
            navigation.navigate('ConfirmWalletService')
        } catch (error) {
            log.error('prepareWalletServicePayment', error)
            toast.show({
                content: getWalletServiceRetryableError(
                    t,
                    (error as RpcFiOperationError | undefined)?.code,
                ),
                status: 'error',
            })
        } finally {
            setIsSubmitting(false)
        }
    }, [dispatch, fedimint, size, navigation, toast, t])

    const style = styles(theme)

    const summaryValue = (value: string) => (
        <Text
            caption
            medium
            color={isSummaryStale ? theme.colors.grey : theme.colors.primary}>
            {value}
        </Text>
    )

    return (
        <>
            <WalletServiceScreenHeader
                backButton
                title={t('feature.wallet-service.guardian-set-title')}
                step={STEP_INDEX}>
                {insufficientSeatsDetail && (
                    <WarningBanner
                        title={t('feature.wallet-service.not-enough-title')}
                        message={t(
                            // at the smallest preset there is no smaller
                            // set to suggest, so only the retry line shows
                            size <= WALLET_SERVICE_SIZE_OPTIONS[0]
                                ? 'feature.wallet-service.not-enough-body-minimum'
                                : 'feature.wallet-service.not-enough-body',
                            {
                                requested: insufficientSeatsDetail.requested,
                                eligible: insufficientSeatsDetail.eligible,
                            },
                        )}
                    />
                )}
            </WalletServiceScreenHeader>
            <SafeScrollArea edges="notop" padding="lg">
                <Column gap="lg" grow>
                    <Column gap="sm">
                        <Eyebrow>
                            {t('feature.wallet-service.guardians-label')}
                        </Eyebrow>
                        <Switcher
                            options={WALLET_SERVICE_SIZE_OPTIONS.map(
                                option => ({
                                    label: `${option}`,
                                    value: `${option}`,
                                    // a quote can only be for the count it was
                                    // requested with, so the count is locked
                                    // while a search is in flight
                                    disabled: isPreviewing && option !== size,
                                }),
                            )}
                            selected={`${size}`}
                            onChange={value => {
                                const nextSize = Number(value)
                                if (nextSize === size) return
                                setSize(nextSize)
                                // seats and totals quoted for the previous
                                // count would mislead, so they clear at once
                                setPreviewError(null)
                                dispatch(clearWalletServiceSelectionPreview())
                            }}
                        />
                        <Row justify="between" gap="sm">
                            <Text small color={theme.colors.darkGrey}>
                                {t('feature.wallet-service.scale-revenue')}
                            </Text>
                            <Text small color={theme.colors.darkGrey}>
                                {t('feature.wallet-service.scale-resilience')}
                            </Text>
                        </Row>
                    </Column>

                    <Row align="center" gap="sm">
                        {/* Flex has no baseline option, so the count and its
                            unit sit in a plain baseline-aligned row */}
                        <View style={style.headline}>
                            <Text
                                style={style.headlineCount}
                                testID="guardian-count-headline">
                                {size}
                            </Text>
                            <Text style={style.headlineUnit}>
                                {t(
                                    'feature.wallet-service.guardians-label',
                                ).toLowerCase()}
                            </Text>
                        </View>
                        {size === RECOMMENDED_WALLET_SERVICE_SIZE && (
                            <SuccessPill
                                withCheck
                                label={t('feature.wallet-service.recommended')}
                            />
                        )}
                    </Row>

                    <Column>
                        <Row align="center" style={style.statRow}>
                            <Text caption color={theme.colors.darkGrey}>
                                {t('feature.wallet-service.verification')}
                            </Text>
                            <Row
                                align="center"
                                gap="xs"
                                style={style.statValue}>
                                {summaryValue(
                                    t('feature.wallet-service.all-verified'),
                                )}
                                <HelpTooltip
                                    svgName="Info"
                                    svgProps={{
                                        color: theme.colors.grey,
                                        size: 16,
                                    }}>
                                    <Text caption>
                                        {t(
                                            'feature.wallet-service.verification-help',
                                        )}
                                    </Text>
                                </HelpTooltip>
                            </Row>
                        </Row>
                        <Row align="center" style={style.statRow}>
                            <Text caption color={theme.colors.darkGrey}>
                                {t('feature.wallet-service.resilience')}
                            </Text>
                            <Row
                                align="center"
                                gap="xs"
                                style={style.statValue}>
                                {summaryValue(
                                    `${t(`feature.wallet-service.${scale.resilience}`)} · ${t(
                                        'feature.wallet-service.can-go-offline',
                                        {
                                            count: walletServiceFaultTolerance(
                                                size,
                                            ),
                                        },
                                    )}`,
                                )}
                            </Row>
                        </Row>
                        <Row align="center" style={style.statRow}>
                            <Text caption color={theme.colors.darkGrey}>
                                {t('feature.wallet-service.revenue')}
                            </Text>
                            <Row
                                align="center"
                                gap="xs"
                                style={style.statValue}>
                                {summaryValue(
                                    t(
                                        `feature.wallet-service.${scale.revenue}`,
                                    ),
                                )}
                            </Row>
                        </Row>
                    </Column>

                    {/* with the not-enough banner up there is no quote coming,
                        so a loading skeleton would be a lie */}
                    {(totalAmounts || !insufficientSeatsDetail) && (
                        <Column align="center" gap="xxs" style={style.costCard}>
                            <Eyebrow>
                                {t('feature.wallet-service.total-setup-cost')}
                            </Eyebrow>
                            {totalAmounts ? (
                                <>
                                    {/* setup cost is quoted in sats regardless of
                                    the wallet's display preference, and the
                                    fiat line is the conversion, not the price */}
                                    <Text h1 medium testID="total-setup-cost">
                                        {totalAmounts.formattedSats}
                                    </Text>
                                    <Text caption color={theme.colors.darkGrey}>
                                        {t(
                                            'feature.wallet-service.cost-one-time',
                                            {
                                                amount: totalAmounts.formattedFiat,
                                            },
                                        )}
                                    </Text>
                                </>
                            ) : (
                                <Column align="center" gap="xs">
                                    <Skeleton width={160} height={32} />
                                    <Skeleton width={120} height={14} />
                                    <Text small color={theme.colors.darkGrey}>
                                        {t(
                                            'feature.wallet-service.finding-guardians',
                                        )}
                                    </Text>
                                </Column>
                            )}
                        </Column>
                    )}

                    {/* The placeholder list stands wherever there is no card to
                        put there — unless the not-enough banner is up, in which
                        case no quote is coming and a placeholder would be a lie.

                        Shown on "no preview", NOT on "a fetch is running".
                        Changing the count clears the preview immediately but
                        only arms the fetch, so `isPreviewing` stays false for
                        the whole debounce. Gated on it, this stayed empty for
                        that window while the cost card above was already in its
                        loading shape, and the two placeholders started 350ms
                        apart. On "no preview" they start together. */}
                    {!preview && !insufficientSeatsDetail && (
                        <Column testID="guardian-details-slot">
                            <GuardianSeatsSkeleton />
                        </Column>
                    )}
                    {preview && (
                        <Column gap="sm">
                            <Pressable
                                testID="guardian-details-toggle"
                                containerStyle={style.detailsCard}
                                onPress={() => setIsDetailsOpen(open => !open)}>
                                <Row align="center" gap="md" grow>
                                    <Text style={style.detailsLabel}>
                                        {t(
                                            'feature.wallet-service.guardian-details',
                                        )}
                                    </Text>
                                    {/* no chevron-up asset exists, so the
                                        down one flips, as the design does */}
                                    <SvgImage
                                        name="ChevronDown"
                                        size="sm"
                                        color={theme.colors.darkGrey}
                                        containerStyle={
                                            isDetailsOpen
                                                ? style.chevronOpen
                                                : undefined
                                        }
                                    />
                                </Row>
                            </Pressable>
                            {isDetailsOpen &&
                                preview.seats.map((seat, index) => (
                                    <Row
                                        key={`${seat.fmanId}-${index}`}
                                        align="center"
                                        gap="md"
                                        style={style.seatRow}>
                                        <Column
                                            align="center"
                                            justify="center"
                                            style={style.avatar}>
                                            <Text small bold>
                                                {initialsFor(seat.fmanId)}
                                            </Text>
                                        </Column>
                                        <Column gap="xxs" grow>
                                            {/* `fmanName` lands with the stack
                                                rebase onto `shaurya/fi-client-init`
                                                (58d298e91, needs manifold
                                                b1f4e610); until then the id is
                                                the only identity there is, so
                                                this falls back to it rather
                                                than showing a placeholder.
                                                Drop the cast once the rebase
                                                puts the field on the type. */}
                                            <Text
                                                caption
                                                bold
                                                color={theme.colors.black}>
                                                {seatDisplayName(seat)}
                                            </Text>
                                            <Text
                                                small
                                                color={theme.colors.darkGrey}>
                                                {t(
                                                    'feature.wallet-service.seat-verified',
                                                )}
                                            </Text>
                                        </Column>
                                        <SuccessPill
                                            label={t(
                                                'feature.wallet-service.seat-selected',
                                            )}
                                        />
                                    </Row>
                                ))}
                        </Column>
                    )}

                    <Row align="start" gap="xs">
                        <SvgImage
                            name="Info"
                            size="xs"
                            color={theme.colors.darkGrey}
                        />
                        <Text
                            small
                            color={theme.colors.darkGrey}
                            style={style.grow}>
                            {t('feature.wallet-service.count-permanent-notice')}
                        </Text>
                    </Row>
                </Column>
            </SafeScrollArea>

            {/* pinned, so the commitment stays reachable without scrolling past
                the guardian list */}
            <WalletServiceFooter>
                <Button
                    fullWidth
                    testID="wallet-service-continue"
                    title={t('words.continue')}
                    onPress={() => setIsConfirming(true)}
                    disabled={!canContinue}
                />
            </WalletServiceFooter>

            {/* everything rides in `body`: the shared overlay centres its own
                title and buttons, and it has 47 other consumers to not disturb */}
            <CustomOverlay
                show={isConfirming}
                loading={isSubmitting}
                onBackdropPress={() => setIsConfirming(false)}
                contents={{
                    // the handle rides in `title`: `body` is inside a
                    // ScrollView, which clips it and would scroll it away
                    title: <SheetHandle />,
                    body: (
                        <Column gap="lg" style={style.sheet}>
                            <Column gap="xs">
                                <Row align="start" gap="sm">
                                    <ScreenTitle style={style.grow}>
                                        {t(
                                            'feature.wallet-service.confirm-count-title',
                                            { count: size },
                                        )}
                                    </ScreenTitle>
                                    <PressableIcon
                                        testID="confirm-count-close"
                                        svgName="Close"
                                        svgProps={{
                                            color: theme.colors.darkGrey,
                                            size: 20,
                                        }}
                                        onPress={() => setIsConfirming(false)}
                                    />
                                </Row>
                                <Text style={style.sheetSubtitle}>
                                    {t(
                                        'feature.wallet-service.confirm-count-body',
                                    )}
                                </Text>
                            </Column>
                            <Column>
                                <SummaryRow
                                    isFirst
                                    label={t(
                                        'feature.wallet-service.guardians-label',
                                    )}
                                    value={t(
                                        'feature.wallet-service.confirm-count-permanent',
                                        { count: size },
                                    )}
                                />
                                <SummaryRow
                                    label={t(
                                        'feature.wallet-service.resilience',
                                    )}
                                    value={`${t(`feature.wallet-service.${scale.resilience}`)} · ${t(
                                        'feature.wallet-service.can-go-offline',
                                        {
                                            count: walletServiceFaultTolerance(
                                                size,
                                            ),
                                        },
                                    )}`}
                                />
                            </Column>
                            {/* the journey's own ring rather than the
                                platform's spokes, the same one the guardian
                                set is found under. It stands in a box the
                                height of the button it replaces, so confirming
                                does not resize the sheet */}
                            {isSubmitting ? (
                                <Row
                                    center
                                    testID="confirm-count-busy"
                                    style={style.confirmBusy}>
                                    <MilestoneSpinner />
                                </Row>
                            ) : (
                                <Button
                                    fullWidth
                                    testID="confirm-count-submit"
                                    title={t(
                                        'feature.wallet-service.confirm-count-cta',
                                        { count: size },
                                    )}
                                    onPress={handleConfirm}
                                />
                            )}
                        </Column>
                    ),
                }}
            />
        </>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        headline: {
            alignItems: 'baseline',
            flexDirection: 'row',
            flexGrow: 1,
            gap: theme.spacing.xs,
        },
        headlineCount: {
            color: theme.colors.primary,
            fontSize: fediTheme.fontSizes.h2,
            fontWeight: '700',
            letterSpacing: -0.28,
        },
        headlineUnit: {
            color: theme.colors.darkGrey,
            fontSize: fediTheme.fontSizes.caption,
            fontWeight: '500',
            letterSpacing: -0.28,
        },
        confirmBusy: {
            // holds the footprint of the button it stands in for
            minHeight: theme.sizes.lg,
        },
        detailsLabel: {
            color: theme.colors.primary,
            flex: 1,
            fontSize: fediTheme.fontSizes.caption,
            fontWeight: '600',
        },
        statRow: {
            borderTopColor: theme.colors.dividerGrey,
            borderTopWidth: 1,
            justifyContent: 'space-between',
            paddingVertical: theme.spacing.sm,
        },
        statValue: {
            flexShrink: 1,
            justifyContent: 'flex-end',
        },
        costCard: {
            backgroundColor: theme.colors.grey50,
            borderRadius: theme.borders.defaultRadius,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.xl,
        },
        detailsCard: {
            backgroundColor: DETAILS_CARD_BG,
            borderColor: theme.colors.dividerGrey,
            borderRadius: 14,
            borderWidth: 1,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: 14,
        },
        seatRow: {
            paddingHorizontal: theme.spacing.xs,
            paddingVertical: theme.spacing.sm,
        },
        avatar: {
            backgroundColor: theme.colors.extraLightGrey,
            borderRadius: 999,
            height: 36,
            width: 36,
        },
        chevronOpen: {
            transform: [{ rotate: '180deg' }],
        },
        grow: {
            flex: 1,
        },
        sheet: {
            paddingHorizontal: theme.spacing.sm,
            width: '100%',
        },
        sheetSubtitle: {
            color: theme.colors.darkGrey,
            fontSize: fediTheme.fontSizes.small,
            lineHeight: 16,
        },
    })

export default CreateWalletService
