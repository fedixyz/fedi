import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { theme as fediTheme } from '@fedi/common/constants/theme'
import {
    useJoinableWalletServices,
    type JoinableWalletService,
} from '@fedi/common/hooks/fi'
import { getFederationWelcomeMessage } from '@fedi/common/utils/FederationUtils'

import CustomOverlay from '../../ui/CustomOverlay'
import { Column, Row } from '../../ui/Flex'
import { ScreenTitle } from '../../ui/ScreenTitle'
import { SheetHandle } from '../../ui/SheetHandle'
import { Skeleton } from '../../ui/Skeleton'
import { SuccessPill } from '../../ui/SuccessPill'
import { WarningBanner } from '../../ui/WarningBanner'
import { FederationLogo } from '../federations/FederationLogo'

/**
 * A row at its tallest: 14pt of padding either side of a name (20), an
 * eligibility pill (20) and a two-line welcome (32), with 2pt gaps.
 */
const JOIN_ROW_HEIGHT = 104

/**
 * Half of three rows and the gaps between them.
 *
 * Every state reserves this, so the sheet is one size from the moment it opens.
 * Without it the sheet is spinner-height, then jumps to whatever the lookup
 * returned — under a finger already on its way to a row.
 *
 * Three rows' worth was the reservation, on the reasoning that the sheet should
 * not resize once the rows land. It bought that at the cost of a sheet that
 * opens half-empty for the common answer of one or two services, and the list
 * can be longer than three anyway, so the jump was never actually bought off.
 * Half is enough to stop the spinner-height snap without holding open space
 * that usually stays empty.
 *
 * Exported so the tests can pin every state to the same reservation rather
 * than to a number copied out of here.
 */
export const JOIN_SHEET_MIN_BODY_HEIGHT =
    (JOIN_ROW_HEIGHT * 3 + fediTheme.spacing.sm * 2) / 2

/**
 * How many placeholder cards stand in for the list while the lookup runs.
 *
 * The count is unknown until the answer lands, so this is a shape, not a
 * promise: three reads as a list, and the same three the guardian set uses.
 */
const JOIN_SKELETON_ROWS = 3

/**
 * The Wallet Services that can pay for guardian setup, offered to a user who
 * is in none of them.
 *
 * The sheet owns the lookup. It runs on open and its answer is discarded on
 * close, so reopening the sheet is the retry — which is why the empty and error
 * states send the user back to the screen rather than refetching in place. The
 * screen behind keeps its join offer whatever the answer was, so there is
 * always something to press to come back here.
 *
 * Each row commits to nothing: Join opens the federation's own terms, which is
 * where the decision is actually made.
 */
export const WalletServiceJoinSheet: React.FC<{
    show: boolean
    onDismiss: () => void
    onJoin: (service: JoinableWalletService) => void
}> = ({ show, onDismiss, onJoin }) => {
    const { t } = useTranslation()

    return (
        <CustomOverlay
            show={show}
            onBackdropPress={onDismiss}
            contents={{
                title: (
                    <Column fullWidth gap="xs">
                        <SheetHandle />
                        <ScreenTitle>
                            {t('feature.wallet-service.join-sheet-title')}
                        </ScreenTitle>
                    </Column>
                ),
                // mounted only while open, so each open starts a fresh lookup
                // and no answer from a previous open survives to be shown as
                // the current one
                body: show ? (
                    <JoinSheetBody onDismiss={onDismiss} onJoin={onJoin} />
                ) : null,
            }}
        />
    )
}

const JoinSheetBody: React.FC<{
    onDismiss: () => void
    onJoin: (service: JoinableWalletService) => void
}> = ({ onDismiss, onJoin }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const { services, status } = useJoinableWalletServices()
    const style = styles(theme)

    // A failed check is not an empty one. Membership is unknown, so this must
    // not say "no wallet can pay for setup" — that reads as settled, and the
    // user would stop looking on the strength of a relay timeout.
    if (status === 'error') {
        return (
            <Column
                gap="md"
                fullWidth
                style={style.body}
                testID="join-sheet-error">
                <WarningBanner
                    level="warning"
                    icon="AlertWarningTriangleOutline"
                    title={t('feature.wallet-service.join-sheet-error-title')}
                    message={t('feature.wallet-service.join-sheet-error-body')}
                />
                <Button
                    fullWidth
                    testID="join-sheet-try-again-button"
                    title={t('feature.wallet-service.join-sheet-try-again')}
                    onPress={onDismiss}
                />
            </Column>
        )
    }

    // Same lead as the loaded list, so the sheet says why it is here from the
    // first frame and nothing about it is rewritten once the rows arrive. The
    // wait itself needs no words — the placeholder rows say it, and they stand
    // where the real rows will stand.
    if (status === 'loading') {
        return (
            <Column
                gap="sm"
                fullWidth
                style={style.body}
                testID="join-sheet-loading">
                <Text small style={style.subtitle}>
                    {t('feature.wallet-service.join-sheet-body')}
                </Text>
                <Column gap="sm" fullWidth>
                    {Array.from({ length: JOIN_SKELETON_ROWS }).map(
                        (_, index) => (
                            <JoinableServiceRowSkeleton key={index} />
                        ),
                    )}
                </Column>
            </Column>
        )
    }

    if (services.length === 0) {
        return (
            <Column
                gap="md"
                fullWidth
                style={style.body}
                testID="join-sheet-empty">
                <WarningBanner
                    level="warning"
                    icon="AlertWarningTriangleOutline"
                    title={t(
                        'feature.wallet-service.no-trusted-federation-title',
                    )}
                    message={t('feature.wallet-service.join-sheet-empty-body')}
                />
                <Button
                    fullWidth
                    testID="join-sheet-check-again-button"
                    title={t('feature.wallet-service.join-sheet-check-again')}
                    onPress={onDismiss}
                />
            </Column>
        )
    }

    return (
        <Column gap="sm" fullWidth style={style.body}>
            <Text small style={style.subtitle}>
                {t('feature.wallet-service.join-sheet-body')}
            </Text>
            <Column gap="sm" fullWidth>
                {services.map(service => (
                    <JoinableServiceRow
                        key={service.id}
                        service={service}
                        onJoin={onJoin}
                    />
                ))}
            </Column>
        </Column>
    )
}

/**
 * One placeholder card per row the lookup may return, in the card's own
 * metrics: 40pt logo, name over an eligibility pill over a two-line welcome,
 * and the Join button's footprint on the right.
 *
 * Nothing here is pressable. A row commits to a federation, and a placeholder
 * knows no federation to commit to.
 */
const JoinableServiceRowSkeleton: React.FC = () => {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <Row
            testID="join-row-skeleton"
            align="center"
            gap="md"
            style={style.card}>
            <Skeleton width={40} height={40} style={style.round} />
            <Column gap="xs" grow basis={false}>
                <Skeleton width="55%" height={12} />
                <Skeleton width={72} height={20} style={style.round} />
                <Skeleton width="90%" height={10} />
            </Column>
            <Skeleton width={56} height={32} style={style.button} />
        </Row>
    )
}

const JoinableServiceRow: React.FC<{
    service: JoinableWalletService
    onJoin: (service: JoinableWalletService) => void
}> = ({ service, onJoin }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const style = styles(theme)
    // `welcome_message` is what a federation's own meta publishes;
    // `preview_message` is what the public directory carries for one nobody has
    // joined yet, which is every row here
    const welcome =
        getFederationWelcomeMessage(service.meta) ??
        service.meta.preview_message

    return (
        <Row align="center" gap="md" style={style.card}>
            <FederationLogo federation={service} size={40} />
            <Column gap="xxs" grow basis={false}>
                <Text medium style={style.name}>
                    {service.name}
                </Text>
                {/* the pill sizes to its label rather than to the column. Every
                    row here is from the signed setup-payment set, so the claim
                    is checked */}
                <Row>
                    <SuccessPill
                        label={t('feature.wallet-service.join-eligible-pill')}
                    />
                </Row>
                {/* the welcome text is the only thing that tells these apart,
                    so it previews here rather than waiting for the terms */}
                {welcome && (
                    <Text numberOfLines={2} style={style.welcome}>
                        {welcome}
                    </Text>
                )}
            </Column>
            <Button
                size="sm"
                testID={`join-wallet-service-${service.id}`}
                title={t('words.join')}
                onPress={() => onJoin(service)}
            />
        </Row>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        body: {
            minHeight: JOIN_SHEET_MIN_BODY_HEIGHT,
        },
        card: {
            borderColor: theme.colors.dividerGrey,
            borderRadius: 14,
            borderWidth: 1,
            padding: 14,
            width: '100%',
        },
        name: {
            fontSize: fediTheme.fontSizes.caption,
            lineHeight: 20,
        },
        round: {
            borderRadius: 999,
        },
        button: {
            // the Join button's radius, so its placeholder is its silhouette
            borderRadius: 16,
        },
        subtitle: {
            color: theme.colors.darkGrey,
            fontSize: fediTheme.fontSizes.small,
            lineHeight: 16,
        },
        welcome: {
            color: theme.colors.darkGrey,
            fontSize: fediTheme.fontSizes.small,
            lineHeight: 16,
        },
    })
