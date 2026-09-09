import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { theme as fediTheme } from '@fedi/common/constants/theme'
import { useBalance } from '@fedi/common/hooks/amount'
import { useFedimint } from '@fedi/common/hooks/fedimint'
import {
    useWalletServiceFederationId,
    useWalletServiceRecoveryStage,
} from '@fedi/common/hooks/fi'
import { useNuxStep } from '@fedi/common/hooks/nux'
import {
    selectFiFederationJoinFailure,
    selectFiFormationName,
    selectFiInviteCode,
    selectFiIsUnsynced,
    selectFiStatus,
    selectIsWalletServiceLightningRunning,
    selectWalletServiceGuardianCount,
    selectLoadedFederation,
} from '@fedi/common/redux'
import type { GuardianStatus } from '@fedi/common/types/bindings'

import RecoveryInProgress from '../components/feature/recovery/RecoveryInProgress'
import { WalletServiceDashboardHeader } from '../components/feature/walletservice/WalletServiceDashboardHeader'
import { WalletServiceInviteSheet } from '../components/feature/walletservice/WalletServiceInviteSheet'
import {
    WalletServiceTour,
    type WalletServiceTourStep,
} from '../components/feature/walletservice/WalletServiceTour'
import { Eyebrow } from '../components/ui/Eyebrow'
import { Column, Row } from '../components/ui/Flex'
import { Pressable } from '../components/ui/Pressable'
import { SafeScrollArea } from '../components/ui/SafeArea'
import { Skeleton } from '../components/ui/Skeleton'
import SvgImage from '../components/ui/SvgImage'
import { SERVICE_CARD_BG, SERVICE_GREEN } from '../constants/walletServiceTheme'
import { useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'WalletServiceDashboard'
>

/** What the design shows in place of the amount while it is hidden. */
const MASKED_BALANCE = '••••'

/**
 * Delay before the tour opens, matching the prototype. It lets the screen's
 * entrance settle and the post-creation toast be read before the scrim lands.
 */
const TOUR_DELAY_MS = 620

const WalletServiceDashboard: React.FC<Props> = ({ navigation }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const fedimint = useFedimint()
    const formationName = useAppSelector(selectFiFormationName)
    const inviteCode = useAppSelector(selectFiInviteCode)
    const isUnsynced = useAppSelector(selectFiIsUnsynced)
    // watched app-wide by WalletServiceMonitor, so this reports a request the
    // user started on another screen — or in an earlier run of the app
    const isAttachingLightning = useAppSelector(
        selectIsWalletServiceLightningRunning,
    )
    const totalGuardians = useAppSelector(selectWalletServiceGuardianCount)

    const federationId = useWalletServiceFederationId()
    // federation-owned readiness, not `isUsable`: the balance and the withdraw
    // path both come from Fedimint, so an FI snapshot that is merely
    // re-reconciling must not replace them with a recovery loader. The FI
    // caveat is carried by the guardian-line skeleton below.
    const { isWalletReady } = useWalletServiceRecoveryStage()
    const [guardianStatuses, setGuardianStatuses] = useState<
        GuardianStatus[] | null
    >(null)
    const [isBalanceRevealed, setIsBalanceRevealed] = useState(false)
    const [isInviteShown, setIsInviteShown] = useState(false)

    const isFederationLoaded = useAppSelector(s =>
        federationId ? Boolean(selectLoadedFederation(s, federationId)) : false,
    )
    // the live name, which a rename writes to federation consensus — not
    // `intent.federationName`, which is creation-time and stands in only until
    // the federation loads
    const federationName = useAppSelector(s =>
        federationId
            ? (selectLoadedFederation(s, federationId)?.name ?? null)
            : null,
    )
    const name = federationName || formationName
    const { formattedBalanceSats, formattedBalanceFiat } = useBalance(
        t,
        federationId ?? '',
    )

    useEffect(() => {
        // `getGuardianStatus` requires the federation to already be joined
        // and loaded — the bridge auto-joins it once formation completes,
        // but that join races this screen's mount, so wait for it rather
        // than retrying on a timer.
        if (!federationId || !isFederationLoaded) return
        let isMounted = true
        fedimint
            .getGuardianStatus(federationId)
            .then(statuses => {
                if (isMounted) setGuardianStatuses(statuses)
            })
            .catch(() => {
                // leave guardianStatuses null — the guardian row falls back
                // to the plain count rather than claiming a status
            })
        return () => {
            isMounted = false
        }
    }, [federationId, isFederationLoaded, fedimint])

    const onlineGuardians = guardianStatuses
        ? guardianStatuses.filter(g => 'online' in g).length
        : null
    const isLive =
        onlineGuardians !== null && onlineGuardians === totalGuardians

    // A `backupEligible` restored service reaches this screen before its
    // federation is joined, so the join can still fail underneath it. The
    // terminal state — the reason, the frozen checklist, and the way out — is
    // WalletServiceProgress's, and this screen has only a spinner. `replace`,
    // not `navigate`: the dashboard the user is being taken off has nothing
    // left to come back to.
    // the boolean, not the failure object: that one is rebuilt on every read,
    // and an effect keyed on it would re-run for every unrelated store change.
    const hasJoinFailed = useAppSelector(
        s => selectFiFederationJoinFailure(s) !== null,
    )
    // Restored only — the same pair the terminal state on WalletServiceProgress
    // renders for. The bridge reports a failed join on the created path too,
    // where this screen is where the user belongs; handing that one over would
    // put the creation checklist, its confetti and its fee onboarding in front
    // of someone whose service was created long ago.
    const isRestoredService =
        useAppSelector(selectFiStatus)?.type === 'restored'
    // No loop back: Progress only returns here once the service is usable,
    // which means the wallet is ready — exactly the condition that makes a
    // retained failure stale in `selectFiFederationJoinFailure`.
    useEffect(() => {
        if (isRestoredService && hasJoinFailed)
            navigation.replace('WalletServiceProgress')
    }, [isRestoredService, hasJoinFailed, navigation])

    const [hasSeenTour, completeTour] = useNuxStep('hasSeenWalletServiceTour')
    const [isTourOpen, setIsTourOpen] = useState(false)
    const balanceRef = useRef<View | null>(null)
    const withdrawRef = useRef<View | null>(null)
    const settingsRef = useRef<View | null>(null)

    useEffect(() => {
        if (hasSeenTour) return
        const timer = setTimeout(() => setIsTourOpen(true), TOUR_DELAY_MS)
        return () => clearTimeout(timer)
    }, [hasSeenTour])

    const tourSteps = useMemo<WalletServiceTourStep[]>(
        () => [
            {
                ref: balanceRef,
                titleKey: 'feature.wallet-service.tour-balance-title',
                bodyKey: 'feature.wallet-service.tour-balance-body',
            },
            {
                ref: withdrawRef,
                titleKey: 'feature.wallet-service.tour-withdraw-title',
                bodyKey: 'feature.wallet-service.tour-withdraw-body',
            },
            {
                ref: settingsRef,
                titleKey: 'feature.wallet-service.tour-settings-title',
                bodyKey: 'feature.wallet-service.tour-settings-body',
            },
        ],
        [],
    )

    const handleTourDone = useCallback(() => {
        setIsTourOpen(false)
        completeTour()
    }, [completeTour])

    const style = styles(theme)

    return (
        <>
            <WalletServiceDashboardHeader settingsRef={settingsRef} />
            {/* locked while the tour is open: every highlight is measured in
                window coordinates, and a scroll underneath the scrim would
                leave the spotlight pointing at empty space */}
            <SafeScrollArea
                edges="notop"
                padding="lg"
                scrollEnabled={!isTourOpen}>
                <Column>
                    {/* `.fed-home-hero`: icon, identity, invite action */}
                    {/* top-aligned: centring floats the name above the tile
                        once the attaching line makes this three rows */}
                    <Row align="start" gap={12} style={style.hero}>
                        <Row center style={style.heroIcon}>
                            <SvgImage
                                name="Wallet"
                                size={26}
                                color={theme.colors.white}
                            />
                        </Row>
                        <Column gap={3} grow shrink>
                            <Row align="center" gap="xs">
                                <Text style={style.name} numberOfLines={1}>
                                    {name ??
                                        t(
                                            'feature.wallet-service.dashboard-title',
                                        )}
                                </Text>
                                <Pressable
                                    testID="wallet-service-edit-name"
                                    containerStyle={style.iconButton}
                                    hitSlop={8}
                                    onPress={() =>
                                        navigation.navigate(
                                            'WalletServiceSettings',
                                        )
                                    }>
                                    <SvgImage
                                        name="Edit"
                                        size={14}
                                        color={theme.colors.primary}
                                    />
                                </Pressable>
                            </Row>
                            {isUnsynced ? (
                                <Skeleton
                                    height={12}
                                    width={112}
                                    testID="wallet-service-guardians-skeleton"
                                />
                            ) : onlineGuardians === null ? (
                                <Text style={style.status} numberOfLines={1}>
                                    {t(
                                        'feature.wallet-service.dashboard-guardian-count',
                                        { total: totalGuardians },
                                    )}
                                </Text>
                            ) : (
                                <Row align="center" gap={6}>
                                    <Row
                                        style={[
                                            style.liveDot,
                                            !isLive && style.liveDotDown,
                                        ]}
                                    />
                                    <Text
                                        style={style.status}
                                        numberOfLines={1}>
                                        {t(
                                            isLive
                                                ? 'feature.wallet-service.dashboard-live-guardians'
                                                : 'feature.wallet-service.dashboard-offline-guardians',
                                            {
                                                online: onlineGuardians,
                                                total: totalGuardians,
                                            },
                                        )}
                                    </Text>
                                </Row>
                            )}
                            {isAttachingLightning && (
                                <Pressable
                                    testID="wallet-service-lightning-status"
                                    containerStyle={style.attachRow}
                                    hitSlop={10}
                                    onPress={() =>
                                        navigation.navigate(
                                            'WalletServiceSettings',
                                            { openSheet: 'provider' },
                                        )
                                    }>
                                    <Row align="center" gap={6}>
                                        <Row style={style.attachDot} />
                                        <Text
                                            style={style.attachStatus}
                                            numberOfLines={1}>
                                            {t(
                                                'feature.wallet-service.dashboard-lightning-attaching',
                                            )}
                                        </Text>
                                        <SvgImage
                                            name="ChevronRightSmall"
                                            size={12}
                                            color={theme.colors.orange}
                                        />
                                    </Row>
                                </Pressable>
                            )}
                        </Column>
                        <Pressable
                            testID="wallet-service-invite"
                            containerStyle={style.qrButton}
                            disabled={!inviteCode}
                            // the shared Pressable does not forward `disabled`
                            // to the underlying pressable, so guard the handler
                            onPress={
                                inviteCode
                                    ? () => setIsInviteShown(true)
                                    : undefined
                            }>
                            <SvgImage name="Qr" size={16} />
                        </Pressable>
                    </Row>

                    {/* `.fed-home-bal`: the balance is the screen's headline,
                        not another stat line. The wrapper is the tour's
                        highlight target — a composed component need not forward
                        its ref to a node that can be measured. */}
                    {/* the gap below the card sits on the wrapper, not on the
                        card: a child's margin counts towards the wrapper's
                        measured height, and the tour would cut its spotlight
                        10 too tall */}
                    <View
                        ref={balanceRef}
                        collapsable={false}
                        style={style.balanceTarget}>
                        <Pressable
                            testID="wallet-service-balance"
                            containerStyle={style.balanceCard}
                            onPress={() => setIsBalanceRevealed(v => !v)}>
                            <Column align="center" grow>
                                <Row
                                    center
                                    gap={6}
                                    style={style.balanceLabelRow}>
                                    <Eyebrow>{t('words.balance')}</Eyebrow>
                                    <SvgImage
                                        name={
                                            isBalanceRevealed
                                                ? 'EyeClosed'
                                                : 'Eye'
                                        }
                                        size={15}
                                        color={theme.colors.darkGrey}
                                    />
                                </Row>
                                {/* fixed height: the tour spotlight is measured
                                    in window coordinates with scrolling locked,
                                    so the card must not grow or shrink when
                                    `isWalletReady` flips. Pinned to the amount line
                                    (h2, lineHeight 29) plus the equiv caption
                                    line under it (paddingTop 2 + its own
                                    line), which is what the two `<Text>`s below
                                    occupy — measured once and fixed here rather
                                    than recomputed on every render. */}
                                <View
                                    testID="wallet-service-balance-content"
                                    style={style.balanceContent}>
                                    {isWalletReady ? (
                                        <>
                                            <Text
                                                testID="wallet-service-balance-amount"
                                                style={style.balanceAmount}>
                                                {isBalanceRevealed
                                                    ? formattedBalanceSats
                                                    : MASKED_BALANCE}
                                            </Text>
                                            <Text style={style.balanceEquiv}>
                                                {isBalanceRevealed
                                                    ? `≈ ${formattedBalanceFiat}`
                                                    : t(
                                                          'feature.wallet-service.dashboard-tap-to-reveal',
                                                      )}
                                            </Text>
                                        </>
                                    ) : (
                                        <RecoveryInProgress
                                            federationId={federationId ?? ''}
                                            size={40}
                                            testID="wallet-service-recovery-in-progress"
                                        />
                                    )}
                                </View>
                            </Column>
                        </Pressable>
                    </View>

                    <View ref={withdrawRef} collapsable={false}>
                        {/* the guardian fees dashboard is the operator's real
                            withdraw path: same fee earnings, and it owns the
                            only rpc that can pay them out */}
                        <Button
                            fullWidth
                            testID="wallet-service-withdraw"
                            title={t('feature.wallet-service.withdraw-balance')}
                            disabled={!federationId || !isWalletReady}
                            onPress={() => {
                                if (!federationId || !isWalletReady) return
                                navigation.navigate('GuardianFees', {
                                    federationId,
                                })
                            }}
                            containerStyle={style.withdrawButton}
                        />
                    </View>
                </Column>
            </SafeScrollArea>

            {/* seen the moment the last step is reached, not only when the
                sheet closes: a finished walk-through stays finished however
                it is left afterwards */}
            <WalletServiceTour
                show={isTourOpen}
                steps={tourSteps}
                onLastStep={completeTour}
                onDone={handleTourDone}
            />

            {inviteCode && (
                <WalletServiceInviteSheet
                    show={isInviteShown}
                    inviteCode={inviteCode}
                    serviceName={name}
                    onDismiss={() => setIsInviteShown(false)}
                />
            )}
        </>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        attachRow: {
            alignSelf: 'flex-start',
            // The shared Pressable's base padding beats a `padding` shorthand,
            // so both axes are zeroed by name; hitSlop restores the tap target.
            // Spacing comes from the column's gap, not a margin here.
            paddingHorizontal: 0,
            paddingVertical: 0,
        },
        attachDot: {
            backgroundColor: theme.colors.orange,
            borderRadius: 999,
            height: 7,
            width: 7,
        },
        attachStatus: {
            color: theme.colors.orange,
            fontSize: fediTheme.fontSizes.caption,
            lineHeight: 21,
        },
        hero: {
            paddingBottom: 18,
            paddingTop: 6,
        },
        heroIcon: {
            backgroundColor: theme.colors.primary,
            borderRadius: 14,
            height: 48,
            width: 48,
        },
        name: {
            color: theme.colors.primary,
            flexShrink: 1,
            fontSize: fediTheme.fontSizes.body,
            fontWeight: '700',
        },
        iconButton: {
            // axis-specific: Pressable's base sets paddingVertical/Horizontal
            // and those beat the `padding` shorthand
            paddingHorizontal: 0,
            paddingVertical: 0,
            width: 'auto',
        },
        liveDotDown: {
            backgroundColor: theme.colors.grey,
        },
        liveDot: {
            backgroundColor: SERVICE_GREEN,
            borderRadius: 999,
            height: 7,
            width: 7,
        },
        status: {
            color: theme.colors.darkGrey,
            fontSize: fediTheme.fontSizes.caption,
        },
        qrButton: {
            alignItems: 'center',
            backgroundColor: theme.colors.white,
            borderColor: theme.colors.dividerGrey,
            borderRadius: 8,
            borderWidth: 1,
            height: 32,
            justifyContent: 'center',
            paddingHorizontal: 0,
            paddingVertical: 0,
            width: 32,
        },
        balanceCard: {
            backgroundColor: SERVICE_CARD_BG,
            borderColor: theme.colors.dividerGrey,
            borderRadius: 14,
            borderWidth: 1,
            paddingHorizontal: 14,
            paddingVertical: 16,
        },
        balanceTarget: {
            marginBottom: 10,
        },
        balanceLabelRow: {
            paddingBottom: 4,
        },
        // amount line (h2, lineHeight 29) + equiv line (caption, paddingTop 2
        // plus its own ~18 line height) — measured once from the usable
        // state and pinned so the not-usable fallback renders at the same
        // height; see the comment at the call site for why this matters.
        balanceContent: {
            justifyContent: 'center',
            minHeight: 49,
        },
        balanceAmount: {
            color: theme.colors.primary,
            fontSize: fediTheme.fontSizes.h2,
            fontWeight: '700',
            letterSpacing: -0.5,
            lineHeight: 29,
        },
        balanceEquiv: {
            color: theme.colors.darkGrey,
            fontSize: fediTheme.fontSizes.caption,
            paddingTop: 2,
        },
        withdrawButton: {
            marginTop: 14,
            width: '100%',
        },
    })

export default WalletServiceDashboard
