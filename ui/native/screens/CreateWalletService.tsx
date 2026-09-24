import { useFocusEffect } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useRef, useState } from 'react'
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
    selectWalletServiceDraft,
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

import {
    GUARDIAN_DETAILS_CARD_METRICS,
    GuardianDetailsSkeleton,
} from '../components/feature/walletservice/GuardianDetailsSkeleton'
import { ServiceSheet } from '../components/feature/walletservice/ServiceSheet'
import { WalletServiceScreenHeader } from '../components/feature/walletservice/WalletServiceScreenHeader'
import { Eyebrow } from '../components/ui/Eyebrow'
import { Column, Row } from '../components/ui/Flex'
import HelpTooltip from '../components/ui/HelpTooltip'
import { Pressable } from '../components/ui/Pressable'
import { SafeScrollArea } from '../components/ui/SafeArea'
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

/** Coalesces a walk across presets into one selection round trip. */
const PREVIEW_DEBOUNCE_MS = 350

const STEP_INDEX = 0

const DETAILS_CARD_BG = '#FAFAFA'

/** Also the skeleton's height, so the cost card cannot resize when a quote lands. */
const TOTAL_COST_LINE_HEIGHT = 40

const StatHelp: React.FC<{ children: string }> = ({ children }) => {
    const { theme } = useTheme()
    return (
        <HelpTooltip
            svgName="Info"
            svgProps={{ color: theme.colors.grey, size: 16 }}>
            <Text caption>{children}</Text>
        </HelpTooltip>
    )
}

/** Every preset has its own rung — do not collapse these into ranges. */
const GUARDIAN_SCALE = {
    7: { resilience: 'resilience-basic', revenue: 'revenue-highest' },
    10: { resilience: 'resilience-good', revenue: 'revenue-high' },
    13: { resilience: 'resilience-strong', revenue: 'revenue-medium' },
    16: { resilience: 'resilience-very-strong', revenue: 'revenue-lower' },
    19: { resilience: 'resilience-maximum', revenue: 'revenue-lowest' },
} as const

const scaleFor = (size: number) =>
    GUARDIAN_SCALE[size as keyof typeof GUARDIAN_SCALE] ?? GUARDIAN_SCALE[10]

/**
 * `fmanName` is not on the type on this branch, so the cast is a shim that
 * starts returning real names once the bridge change lands. Names can collide,
 * so the id stays the fallback rather than a placeholder.
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
    const draft = useAppSelector(selectWalletServiceDraft)
    const isRoutingAway = useWalletServiceEntryGuard()

    // the draft outlives this screen, so a return lands on the count the user
    // chose rather than back on the recommendation
    const [size, setSize] = useState(draft.size)
    // starts true only when a selection is about to be scheduled: the count
    // options are locked while this is true, and a returning user has come back
    // to change the count
    const [isPreviewing, setIsPreviewing] = useState(() => !preview)
    const [previewError, setPreviewError] =
        useState<RpcFiOperationError | null>(null)
    const [isDetailsOpen, setIsDetailsOpen] = useState(false)
    const [isConfirming, setIsConfirming] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    // the bridge call cannot be aborted, so a response that lands after the
    // user has backed out is dropped instead: no state update, no toast
    const isFocusedRef = useRef(true)
    /** The count a search has been started for, set when the call goes out. */
    const requestedSizeRef = useRef<number | null>(null)
    const hadPreviewRef = useRef(preview !== null)

    /**
     * Losing a held quote frees the count to be searched for again.
     *
     * Without this, a count already searched for stays blocked by the ref even
     * though its quote is gone, and the screen never recovers: flip 10 to 7 and
     * back inside the debounce, or return from the payment screen after a
     * reauthorization nulled the preview, and the skeleton stays for ever.
     *
     * It keys on the transition, not on `preview === null`. A failed search
     * leaves the preview null throughout, so there is no transition and the ref
     * still stops a failing 60 second call from being retried on every focus.
     */
    useEffect(() => {
        if (hadPreviewRef.current && preview === null) {
            requestedSizeRef.current = null
        }
        hadPreviewRef.current = preview !== null
    }, [preview])

    // the thunk reads the count from the draft, so every caller must write the
    // draft before it gets here
    const quoteSelection = useCallback(async () => {
        setIsPreviewing(true)
        try {
            await dispatch(prepareWalletServicePayment({ fedimint })).unwrap()
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
                    content: getWalletServiceRetryableError(t, opError?.code),
                    status: 'error',
                })
            }
        } finally {
            if (isFocusedRef.current) setIsPreviewing(false)
        }
    }, [dispatch, fedimint, toast, t])

    useFocusEffect(
        useCallback(() => {
            isFocusedRef.current = true
            setPreviewError(null)
            return () => {
                isFocusedRef.current = false
            }
        }, []),
    )

    // the two guards answer different questions. The held quote covers a return
    // to the flow, where this screen has been remounted and the ref is empty.
    // The ref covers a search already taken for this count, so a quote that
    // comes back reporting another count cannot re-arm this effect for ever.
    useFocusEffect(
        useCallback(() => {
            // a live formation makes the bridge reject this as `busy`, and the
            // guard is already navigating away from it
            if (isRoutingAway) return
            if (preview?.selected === size) return
            if (requestedSizeRef.current === size) return
            const timeout = setTimeout(() => {
                requestedSizeRef.current = size
                void quoteSelection()
            }, PREVIEW_DEBOUNCE_MS)
            return () => clearTimeout(timeout)
        }, [size, preview, quoteSelection, isRoutingAway]),
    )

    const insufficientSeatsDetail =
        previewError?.detail?.type === 'insufficientFmanSeats'
            ? previewError.detail
            : null
    // a quote held from an earlier visit is shown rather than discarded, so the
    // count check has to dim it when it no longer answers the chosen count
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
    // the bridge refuses to spend an expired quote, so one is taken here rather
    // than leaving the payment screen to fail
    const isQuoteUsable =
        preview !== null &&
        preview.selected === size &&
        preview.validUntil * 1000 > Date.now()

    const handleConfirm = useCallback(async () => {
        dispatch(setWalletServiceDraft({ size }))
        if (isQuoteUsable) {
            setIsConfirming(false)
            navigation.navigate('ConfirmWalletService')
            return
        }
        setIsSubmitting(true)
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
    }, [dispatch, fedimint, size, isQuoteUsable, navigation, toast, t])

    const style = styles(theme)

    const summaryValue = (value: string) => (
        <Text
            caption
            medium
            color={isSummaryStale ? theme.colors.grey : theme.colors.primary}
            style={style.summaryValue}>
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
                                    // a quote answers one count only, so the
                                    // count is locked while a search runs
                                    disabled: isPreviewing && option !== size,
                                }),
                            )}
                            selected={`${size}`}
                            onChange={value => {
                                const nextSize = Number(value)
                                if (nextSize === size) return
                                setSize(nextSize)
                                setPreviewError(null)
                                // the draft is written here, not when the
                                // search starts, so a back press inside the
                                // debounce still keeps the chosen count
                                dispatch(
                                    setWalletServiceDraft({ size: nextSize }),
                                )
                                dispatch(clearWalletServiceSelectionPreview())
                            }}
                        />
                        <Row justify="between" gap="sm">
                            <Text caption color={theme.colors.darkGrey}>
                                {t('feature.wallet-service.scale-revenue')}
                            </Text>
                            <Text caption color={theme.colors.darkGrey}>
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
                                <StatHelp>
                                    {t(
                                        'feature.wallet-service.fee-breakdown-peerbadge-info',
                                    )}
                                </StatHelp>
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
                                <StatHelp>
                                    {t(
                                        'feature.wallet-service.resilience-help',
                                    )}
                                </StatHelp>
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
                                <StatHelp>
                                    {t('feature.wallet-service.revenue-help')}
                                </StatHelp>
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
                                    {/* setup cost is quoted in sats whatever
                                        the wallet's display preference; the
                                        fiat line is a conversion, not the
                                        price */}
                                    <Text
                                        h1
                                        medium
                                        testID="total-setup-cost"
                                        style={style.totalCost}>
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
                                <>
                                    <Skeleton
                                        width={160}
                                        height={TOTAL_COST_LINE_HEIGHT}
                                    />
                                    <Text caption color={theme.colors.darkGrey}>
                                        {t(
                                            'feature.wallet-service.finding-guardians',
                                        )}
                                    </Text>
                                </>
                            )}
                        </Column>
                    )}

                    {/* gated on "no preview", not on "a search is running":
                        changing the count clears the preview at once but only
                        arms the search, so `isPreviewing` would start this
                        placeholder a debounce later than the cost card's */}
                    {!preview && !insufficientSeatsDetail && (
                        <Column testID="guardian-details-slot">
                            <GuardianDetailsSkeleton />
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
                                        {/* the seat's place in the set, not an
                                            identity */}
                                        <Text
                                            caption
                                            medium
                                            color={theme.colors.darkGrey}
                                            style={style.seatNumber}>
                                            {index + 1}
                                        </Text>
                                        <Column gap="xxs" grow>
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
                            caption
                            color={theme.colors.darkGrey}
                            style={style.grow}>
                            {t('feature.wallet-service.count-permanent-notice')}
                        </Text>
                    </Row>
                </Column>
            </SafeScrollArea>

            <WalletServiceFooter>
                <Button
                    fullWidth
                    testID="wallet-service-continue"
                    title={t('words.continue')}
                    onPress={() => setIsConfirming(true)}
                    disabled={!canContinue}
                />
            </WalletServiceFooter>

            <ServiceSheet
                show={isConfirming}
                loading={isSubmitting}
                onDismiss={() => setIsConfirming(false)}
                showClose
                closeTestID="confirm-count-close"
                title={t('feature.wallet-service.confirm-count-title', {
                    count: size,
                })}
                description={t('feature.wallet-service.confirm-count-body')}
                buttons={[
                    {
                        text: t('feature.wallet-service.confirm-count-cta', {
                            count: size,
                        }),
                        primary: true,
                        testID: 'confirm-count-submit',
                        onPress: handleConfirm,
                    },
                ]}>
                <Column>
                    <SummaryRow
                        isFirst
                        label={t('feature.wallet-service.guardians-label')}
                        value={t(
                            'feature.wallet-service.confirm-count-permanent',
                            { count: size },
                        )}
                    />
                    <SummaryRow
                        label={t('feature.wallet-service.resilience')}
                        value={`${t(`feature.wallet-service.${scale.resilience}`)} · ${t(
                            'feature.wallet-service.can-go-offline',
                            { count: walletServiceFaultTolerance(size) },
                        )}`}
                    />
                </Column>
            </ServiceSheet>
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
        summaryValue: {
            // wraps beside the help icon instead of pushing it off the edge
            flexShrink: 1,
        },
        costCard: {
            backgroundColor: theme.colors.grey50,
            borderRadius: theme.borders.defaultRadius,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.xl,
        },
        // the box the placeholder stands in for, so the two cannot drift apart
        detailsCard: {
            backgroundColor: DETAILS_CARD_BG,
            borderColor: theme.colors.dividerGrey,
            paddingHorizontal: theme.spacing.lg,
            ...GUARDIAN_DETAILS_CARD_METRICS,
        },
        totalCost: {
            lineHeight: TOTAL_COST_LINE_HEIGHT,
        },
        seatRow: {
            paddingHorizontal: theme.spacing.xs,
            paddingVertical: theme.spacing.sm,
        },
        seatNumber: {
            // a fixed column so every name starts at the same x, single or
            // double digit
            textAlign: 'center',
            width: 20,
        },
        chevronOpen: {
            transform: [{ rotate: '180deg' }],
        },
        grow: {
            flex: 1,
        },
    })

export default CreateWalletService
