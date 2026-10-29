import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { useAmountFormatter } from '@fedi/common/hooks/amount'
import { selectWalletServicePayerAvailability } from '@fedi/common/redux'
import { LoadedFederation, MSats } from '@fedi/common/types'
import { RpcFaTransferDestinationPreview } from '@fedi/common/types/bindings'

import { useAppSelector } from '../../../state/hooks'
import { useQuoteAutoRefresh } from '../../../utils/hooks/quoteCountdown'
import { Eyebrow } from '../../ui/Eyebrow'
import { Column } from '../../ui/Flex'
import { SafeScrollArea } from '../../ui/SafeArea'
import { SummaryRow } from '../../ui/SummaryRow'
import { WalletServiceFooter } from '../../ui/WalletServiceFooter'
import { WarningBanner } from '../../ui/WarningBanner'
import { AmountHeadline } from './AmountHeadline'
import TopUpSheet from './TopUpSheet'
import { WalletServicePayerRow } from './WalletServicePayerRow'
import { WalletServiceScreenHeader } from './WalletServiceScreenHeader'
import { replacementQuorumLine } from './replacementReasons'

/** Why the review is showing a banner, if it is. */
export type GuardianTransferNotice = 'quoteChanged' | 'paymentFailed'

/**
 * The one banner slot under the title. A failed payment outranks a moved
 * price because it describes an attempt that already happened.
 */
/**
 * Why no wallet can pay, in the confirm screen's terms: a failed lookup, or
 * nothing joined the bridge trusts. Null while there is a payer, or while the
 * lookup is still out and there is nothing to say yet.
 */
const useMissingPayer = (hasPayer: boolean) => {
    const availability = useAppSelector(selectWalletServicePayerAvailability)
    if (hasPayer || availability === 'unknown') return null
    return availability === 'lookupFailed' ? 'lookupFailed' : 'notJoined'
}

const GuardianTransferBanner: React.FC<{
    notice: GuardianTransferNotice | null
    missingPayer: ReturnType<typeof useMissingPayer>
    shortfall: { federation: string; available: string } | null
    formattedPrice: string
}> = ({ notice, missingPayer, shortfall, formattedPrice }) => {
    const { t } = useTranslation()

    if (notice === 'paymentFailed')
        return (
            <WarningBanner
                level="error"
                icon="AlertWarningTriangleOutline"
                title={t('feature.wallet-service.payment-failed-title')}
                message={t(
                    'feature.wallet-service.transfer-payment-failed-body',
                )}
            />
        )
    if (notice === 'quoteChanged')
        return (
            <WarningBanner
                level="warning"
                icon="AlertWarningTriangleOutline"
                title={t('feature.wallet-service.transfer-quote-changed-title')}
                message={t(
                    'feature.wallet-service.transfer-quote-changed-body',
                    { price: formattedPrice },
                )}
            />
        )
    if (missingPayer === 'lookupFailed')
        return (
            <WarningBanner
                level="warning"
                icon="AlertWarningTriangleOutline"
                title={t('feature.wallet-service.payer-lookup-failed-title')}
                message={t('feature.wallet-service.payer-lookup-failed-body')}
            />
        )
    if (missingPayer === 'notJoined')
        return (
            <WarningBanner
                level="warning"
                icon="AlertWarningTriangleOutline"
                title={t('feature.wallet-service.join-card-title')}
                message={t('feature.wallet-service.join-card-body')}
            />
        )
    if (shortfall)
        return (
            <WarningBanner
                level="warning"
                icon="AlertWarningTriangleOutline"
                title={t('feature.wallet-service.transfer-insufficient-title')}
                message={t('feature.wallet-service.insufficient-body', {
                    ...shortfall,
                    needed: formattedPrice,
                })}
            />
        )
    return null
}

const QuoteStatus: React.FC<{
    isStale: boolean
    remainingLabel: string | null
}> = ({ isStale, remainingLabel }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()

    if (isStale)
        return (
            <Text small color={theme.colors.darkGrey} testID="quote-refreshing">
                {t('feature.wallet-service.refreshing-quote')}
            </Text>
        )
    if (!remainingLabel) return null
    return (
        <Text small color={theme.colors.darkGrey} testID="quote-countdown">
            {t('feature.wallet-service.quote-valid-for', {
                remaining: remainingLabel,
            })}
        </Text>
    )
}

/** Who is paid, and which guardian the new host replaces. */
const GuardianTransferDestination: React.FC<{
    mgName: string
    seatName: string
}> = ({ mgName, seatName }) => {
    const { t } = useTranslation()

    return (
        <Column testID="transfer-destination-row" fullWidth>
            <SummaryRow
                isFirst
                label={t('feature.wallet-service.transfer-paid-to')}
                value={t('feature.wallet-service.transfer-paid-to-value', {
                    name: mgName,
                })}
            />
            <SummaryRow
                label={t('feature.wallet-service.transfer-replaces')}
                value={seatName}
            />
        </Column>
    )
}

const GuardianTransferCost: React.FC<{
    priceMsats: MSats
    federationId: string | undefined
    isFree: boolean
    isStale: boolean
    remainingLabel: string | null
    hasQuorum: boolean | null
}> = ({
    priceMsats,
    federationId,
    isFree,
    isStale,
    remainingLabel,
    hasQuorum,
}) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const { makeFormattedAmountsFromMSats } = useAmountFormatter({
        federationId,
    })
    const { formattedFiat } = makeFormattedAmountsFromMSats(priceMsats)
    const { formattedSats: satsNumber } = makeFormattedAmountsFromMSats(
        priceMsats,
        'none',
    )

    return (
        <Column align="center" justify="center" gap="lg" grow>
            <Column align="center" gap="xs">
                {isFree ? (
                    <Text h2 center testID="transfer-cost-free">
                        {t('feature.wallet-service.transfer-free')}
                    </Text>
                ) : (
                    <>
                        <Eyebrow>
                            {t('feature.wallet-service.transfer-one-time')}
                        </Eyebrow>
                        <AmountHeadline
                            satsNumber={satsNumber}
                            fiat={formattedFiat}
                            isStale={isStale}
                            testID="transfer-cost"
                        />
                        {/* the quote is the seat price; the payment's own
                            fees come on top, as a failed payment says */}
                        <Text
                            small
                            color={theme.colors.darkGrey}
                            testID="transfer-network-fee">
                            {t('feature.wallet-service.transfer-network-fee')}
                        </Text>
                    </>
                )}
                <QuoteStatus
                    isStale={isStale}
                    remainingLabel={remainingLabel}
                />
            </Column>
            <Text caption center color={theme.colors.darkGrey}>
                {[
                    t('feature.wallet-service.transfer-cost-note'),
                    replacementQuorumLine(hasQuorum, t),
                ]
                    .filter(Boolean)
                    .join(' ')}
            </Text>
        </Column>
    )
}

/**
 * The quoted price, and what the payer is short of it.
 *
 * `shortfall` is null when the payer can cover it, or when no payer is picked.
 */
const getReviewTitleKey = (isFree: boolean) =>
    isFree
        ? ('feature.wallet-service.transfer-confirm-free-title' as const)
        : ('feature.wallet-service.transfer-confirm-title' as const)

const useTransferPrice = (
    advertisedPriceMsats: string,
    balanceMsats: MSats,
    paymentFederation: Pick<LoadedFederation, 'id' | 'name'> | undefined,
) => {
    const { makeFormattedAmountsFromMSats } = useAmountFormatter({
        federationId: paymentFederation?.id,
    })
    const isFree = advertisedPriceMsats === '0'
    const priceMsats = Number(advertisedPriceMsats) as MSats
    // msats cross the bridge as decimal strings, so compare as bigints
    const canAfford =
        isFree || BigInt(balanceMsats) >= BigInt(advertisedPriceMsats)
    const shortfall =
        paymentFederation && !canAfford
            ? {
                  federation: paymentFederation.name,
                  available:
                      makeFormattedAmountsFromMSats(balanceMsats).formattedSats,
              }
            : null
    return {
        isFree,
        priceMsats,
        formattedPrice: makeFormattedAmountsFromMSats(priceMsats).formattedSats,
        shortfall,
    }
}

const GuardianTransferActions: React.FC<{
    needsTopUp: boolean
    isFree: boolean
    hasPayer: boolean
    isQuoteStale: boolean
    isStarting: boolean
    onTopUp: () => void
    onStart: () => void
}> = ({
    needsTopUp,
    isFree,
    hasPayer,
    isQuoteStale,
    isStarting,
    onTopUp,
    onStart,
}) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const style = styles(theme)

    if (needsTopUp)
        return (
            <Button
                fullWidth
                testID="top-up-button"
                title={t('feature.wallet-service.top-up-button')}
                onPress={onTopUp}
            />
        )
    return (
        <Button
            fullWidth
            testID="transfer-start-button"
            title={t(
                isFree
                    ? 'feature.wallet-service.transfer-start-free'
                    : 'feature.wallet-service.transfer-start',
            )}
            loading={isStarting}
            disabled={!hasPayer || isQuoteStale || isStarting}
            // RNE's default disabled fill is near-white against a white bar,
            // so the button reads as missing
            disabledStyle={style.startDisabled}
            disabledTitleStyle={style.startDisabledTitle}
            onPress={onStart}
        />
    )
}

/** The new host for one guardian, its price, and the payment. */
export const GuardianTransferReview: React.FC<{
    seatName: string
    preview: RpcFaTransferDestinationPreview
    eligiblePayerIds: string[]
    paymentFederation: Pick<LoadedFederation, 'id' | 'name'> | undefined
    balanceMsats: MSats
    notice: GuardianTransferNotice | null
    isRefreshing: boolean
    isStarting: boolean
    hasQuorum: boolean | null
    onStart: () => void
    onRefreshQuote: () => void
    onBack: () => void
}> = ({
    seatName,
    preview,
    eligiblePayerIds,
    paymentFederation,
    balanceMsats,
    notice,
    isRefreshing,
    isStarting,
    hasQuorum,
    onStart,
    onRefreshQuote,
    onBack,
}) => {
    const { t } = useTranslation()
    const [showTopUp, setShowTopUp] = useState(false)

    // the open top-up sheet covers the price, and a deposit routinely outlives
    // the quote, so the clock only runs while the price is on screen
    const { remainingLabel, isExpired } = useQuoteAutoRefresh(
        preview.validUntil,
        showTopUp,
        isRefreshing,
        onRefreshQuote,
    )
    const isQuoteStale = isRefreshing || isExpired

    const missingPayer = useMissingPayer(!!paymentFederation)
    const { isFree, priceMsats, formattedPrice, shortfall } = useTransferPrice(
        preview.advertisedPriceMsats,
        balanceMsats,
        paymentFederation,
    )

    return (
        <>
            <WalletServiceScreenHeader
                backButton
                onBackButtonPress={onBack}
                title={t(getReviewTitleKey(isFree))}>
                <GuardianTransferBanner
                    notice={notice}
                    missingPayer={missingPayer}
                    shortfall={shortfall}
                    formattedPrice={formattedPrice}
                />
            </WalletServiceScreenHeader>
            <SafeScrollArea edges="notop" padding="lg">
                <Column gap="lg" grow>
                    <Column gap="sm" fullWidth>
                        {!isFree && (
                            <WalletServicePayerRow
                                allowedFederationIds={eligiblePayerIds}
                            />
                        )}
                        <GuardianTransferDestination
                            mgName={preview.mgName}
                            seatName={seatName}
                        />
                    </Column>

                    <GuardianTransferCost
                        priceMsats={priceMsats}
                        federationId={paymentFederation?.id}
                        isFree={isFree}
                        isStale={isQuoteStale}
                        remainingLabel={remainingLabel}
                        hasQuorum={hasQuorum}
                    />
                </Column>
            </SafeScrollArea>

            <WalletServiceFooter>
                <GuardianTransferActions
                    needsTopUp={shortfall !== null}
                    isFree={isFree}
                    hasPayer={!!paymentFederation}
                    isQuoteStale={isQuoteStale}
                    isStarting={isStarting}
                    onTopUp={() => setShowTopUp(true)}
                    onStart={onStart}
                />
            </WalletServiceFooter>

            {paymentFederation && (
                <TopUpSheet
                    show={showTopUp}
                    onDismiss={() => setShowTopUp(false)}
                    onFunded={() => {
                        setShowTopUp(false)
                        onRefreshQuote()
                    }}
                    totalMsats={preview.advertisedPriceMsats}
                    availableMsats={String(balanceMsats)}
                    payerFederationId={paymentFederation.id}
                    payerFederationName={paymentFederation.name}
                />
            )}
        </>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        startDisabled: {
            backgroundColor: theme.colors.grey,
        },
        startDisabledTitle: {
            color: theme.colors.white,
        },
    })
