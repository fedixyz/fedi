import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { theme as fediTheme } from '@fedi/common/constants/theme'

import { useLaunchZendesk } from '../../../utils/hooks/support'
import { makeWalletServiceRecoveryFailedTags } from '../../../utils/support'
import { Column } from '../../ui/Flex'
import { WarningBanner } from '../../ui/WarningBanner'

/**
 * Beat before launching, matching WalletServiceProgress's and
 * WalletServiceSettings's handoff to Zendesk: the two animations don't
 * co-operate if they start together.
 */
const SUPPORT_LAUNCH_DELAY_MS = 300

/** Stands in for the amount, which nothing on this device can read yet. */
const UNAVAILABLE_BALANCE = '—'

/**
 * What the dashboard shows in place of the balance when the bridge has given
 * up on joining a *created* service's federation.
 *
 * A spinner would be a lie here: the bridge runs its auto-join once per start,
 * so nothing is still trying and nothing on this screen can retry it. The way
 * out is a relaunch or support, and both are said here rather than left for
 * the user to guess at.
 */
export const WalletServiceJoinFailed: React.FC<{
    federationId: string | null
}> = ({ federationId }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const { launchZendesk } = useLaunchZendesk()
    // the card can give way to the balance on its own; a launch scheduled
    // just before that must not navigate from a component that is gone
    const supportTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(
        () => () => {
            if (supportTimer.current) clearTimeout(supportTimer.current)
        },
        [],
    )

    const handleContactSupport = useCallback(() => {
        supportTimer.current = setTimeout(
            () =>
                launchZendesk(false, {
                    conversationTags:
                        makeWalletServiceRecoveryFailedTags(federationId),
                }),
            SUPPORT_LAUNCH_DELAY_MS,
        )
    }, [launchZendesk, federationId])

    const style = styles(theme)

    return (
        <Column gap="md" testID="wallet-service-join-failed">
            {/* the amount line keeps its place: the balance is unknown, not
                gone, and an empty slot would read as zero */}
            <Text style={style.balanceAmount}>{UNAVAILABLE_BALANCE}</Text>
            <WarningBanner
                level="error"
                icon="AlertWarningTriangleOutline"
                title={t('feature.wallet-service.join-failed-title')}
                message={t('feature.wallet-service.join-failed-body')}
            />
            <Button
                fullWidth
                testID="contact-support-button"
                title={t('phrases.contact-fedi-support')}
                onPress={handleContactSupport}
            />
        </Column>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        // matches the dashboard's own amount line, so the placeholder sits
        // where the figure it stands in for would
        balanceAmount: {
            color: theme.colors.primary,
            fontSize: fediTheme.fontSizes.h2,
            fontWeight: '700',
            letterSpacing: -0.5,
            lineHeight: 29,
        },
    })
