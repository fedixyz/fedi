import Image from 'next/image'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import holoWallet from '@fedi/common/assets/images/holo-wallet.png'
import { HIDDEN_AMOUNT_MASK } from '@fedi/common/constants/currency'
import { WALLET_SERVICE_URL } from '@fedi/common/constants/linking'
import { theme } from '@fedi/common/constants/theme'
import { useBalance } from '@fedi/common/hooks/amount'
import { useAutoSelectFederations } from '@fedi/common/hooks/federation'
import { useRecoveryProgress } from '@fedi/common/hooks/recovery'
import { useToast } from '@fedi/common/hooks/toast'
import { useWalletButtons } from '@fedi/common/hooks/wallet'
import {
    selectBalanceDisplay,
    selectLoadedFederations,
    selectLoadedFederationsByRecency,
    selectSelectedFederation,
    setPayFromFederationId,
    setSelectedFederationId,
} from '@fedi/common/redux'

import { Button } from '../components/Button'
import { ContentBlock } from '../components/ContentBlock'
import FederationStatusAvatar from '../components/FederationStatusAvatar'
import { Column, Row } from '../components/Flex'
import { HoloLoader } from '../components/HoloLoader'
import { Icon } from '../components/Icon'
import { IconButton } from '../components/IconButton'
import * as Layout from '../components/Layout'
import SelectWalletOverlay from '../components/SelectWalletOverlay'
import { Text } from '../components/Text'
import { TourTip } from '../components/TourTip'
import {
    federationRoute,
    onboardingRoute,
    requestRoute,
    sendRoute,
    transactionsRoute,
} from '../constants/routes'
import { useAppDispatch, useAppSelector } from '../hooks'
import { styled } from '../styles'

function WalletPage() {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const router = useRouter()
    const toast = useToast()

    const [open, setOpen] = useState(false)
    const [tooltipOpen, setTooltipOpen] = useState(false)

    const federation = useAppSelector(selectSelectedFederation)
    const federationId = federation?.id ?? ''
    const loadedFederations = useAppSelector(selectLoadedFederations)
    const loadedFederationsByRecency = useAppSelector(
        selectLoadedFederationsByRecency,
    )
    const { recoveryInProgress, formattedPercent } =
        useRecoveryProgress(federationId)
    const { receiveDisabled, sendDisabled, disabledMessage } = useWalletButtons(
        t,
        federationId,
    )
    const { formattedBalanceSats, formattedBalanceFiat } = useBalance(
        t,
        federationId,
    )
    const balanceDisplay = useAppSelector(selectBalanceDisplay)

    useEffect(() => {
        if (loadedFederationsByRecency.length > 0 && !federation)
            dispatch(setSelectedFederationId(loadedFederationsByRecency[0].id))
    }, [federation, loadedFederationsByRecency, dispatch])

    const { pickRandom } = useAutoSelectFederations()

    const handleAutoSelect = useCallback(() => {
        const selected = pickRandom()
        if (!selected?.meta.invite_code) {
            toast.show({
                content: t('errors.failed-to-select-wallet-service'),
                status: 'error',
            })
            return
        }
        router.push(
            `${onboardingRoute}?invite=${encodeURIComponent(selected.meta.invite_code)}`,
        )
    }, [pickRandom, router, toast, t])

    const content = useMemo(() => {
        if (loadedFederations.length === 0) {
            return (
                <SetupContainer gap="md">
                    <Image src={holoWallet} alt="" width={80} height={80} />
                    <Row
                        align="center"
                        gap="xs"
                        justify="center"
                        css={{
                            marginTop: theme.spacing.sm,
                            marginBottom: theme.spacing.sm,
                        }}>
                        <Text weight="medium" css={{ fontSize: 20 }}>
                            {t('feature.wallet.setup-title')}
                        </Text>
                        <TourTip
                            open={tooltipOpen}
                            onOpenChange={setTooltipOpen}
                            side="bottom"
                            content={
                                <Text variant="caption">
                                    {t(
                                        'feature.wallet.setup-tooltip-before-link',
                                    )}
                                    <TooltipLink
                                        onClick={() =>
                                            window.open(
                                                WALLET_SERVICE_URL,
                                                '_blank',
                                            )
                                        }>
                                        {t('feature.wallet.setup-tooltip-link')}
                                    </TooltipLink>
                                    {t(
                                        'feature.wallet.setup-tooltip-after-link',
                                    )}
                                </Text>
                            }>
                            <IconButton
                                icon="Help"
                                size="md"
                                style={{ color: theme.colors.darkGrey }}
                                onClick={() => setTooltipOpen(true)}
                            />
                        </TourTip>
                    </Row>
                    <Button
                        width="full"
                        variant="primary"
                        onClick={handleAutoSelect}>
                        {t('feature.wallet.setup-auto-select')}
                    </Button>
                    <Button
                        width="full"
                        variant="outline"
                        onClick={() => router.push(onboardingRoute)}>
                        {t('feature.wallet.setup-manual')}
                    </Button>
                </SetupContainer>
            )
        }

        if (!federation) return null

        return (
            <WalletContainer>
                <PaymentFederationHeader
                    onClick={() => router.push(federationRoute(federationId))}>
                    <FederationStatusAvatar federation={federation} />
                    <Text
                        variant="h2"
                        weight="bold"
                        css={{ flexGrow: 1, textAlign: 'left' }}>
                        {federation.name}
                    </Text>
                    <TourTip
                        open={tooltipOpen}
                        onOpenChange={setTooltipOpen}
                        side="bottom"
                        content={
                            <Text variant="caption">
                                {t('feature.wallet.wallet-provider-guidance')}
                            </Text>
                        }>
                        <IconButton
                            icon="Help"
                            size="md"
                            style={{ color: theme.colors.darkGrey }}
                            onClick={e => {
                                e.stopPropagation()
                                setTooltipOpen(true)
                            }}
                        />
                    </TourTip>
                    <Icon icon="ChevronRight" color={theme.colors.darkGrey} />
                </PaymentFederationHeader>
                <BalanceCard>
                    <BalanceHeader
                        onClick={() =>
                            router.push(
                                `${transactionsRoute}#id=${federationId}`,
                            )
                        }>
                        <Row gap="sm" align="center">
                            <Icon
                                icon="BitcoinCircle"
                                color={theme.colors.orange}
                            />
                            <Text weight="bold">{t('words.bitcoin')}</Text>
                        </Row>

                        <Icon icon="TxnHistory" size="sm" />
                    </BalanceHeader>
                    <Column center gap="xs" grow>
                        {recoveryInProgress ? (
                            <Column center gap="xs">
                                <HoloLoader size={40} label="" />
                                <Text css={{ color: theme.colors.grey }}>
                                    {formattedPercent}
                                </Text>
                            </Column>
                        ) : (
                            <>
                                <Text weight="bold" variant="h1">
                                    {balanceDisplay === 'hidden'
                                        ? HIDDEN_AMOUNT_MASK
                                        : formattedBalanceFiat}
                                </Text>
                                <Text css={{ color: theme.colors.grey }}>
                                    {balanceDisplay === 'hidden'
                                        ? HIDDEN_AMOUNT_MASK
                                        : formattedBalanceSats}
                                </Text>
                            </>
                        )}
                    </Column>
                </BalanceCard>
                <Row align="center" gap="md">
                    <Button
                        icon="ArrowDown"
                        width="full"
                        disabled={receiveDisabled}
                        onClick={() => {
                            dispatch(setPayFromFederationId(federationId))
                            router.push(requestRoute)
                        }}>
                        {t('words.receive')}
                    </Button>
                    <Button
                        icon="ArrowUp"
                        width="full"
                        disabled={sendDisabled}
                        onClick={() => {
                            dispatch(setPayFromFederationId(federationId))
                            router.push(sendRoute)
                        }}>
                        {t('words.send')}
                    </Button>
                </Row>
                {disabledMessage && (
                    <Text
                        variant="caption"
                        css={{
                            color: theme.colors.darkGrey,
                            textAlign: 'center',
                            paddingBottom: theme.spacing.md,
                        }}>
                        {disabledMessage}
                    </Text>
                )}
            </WalletContainer>
        )
    }, [
        t,
        tooltipOpen,
        loadedFederations,
        router,
        federation,
        recoveryInProgress,
        formattedBalanceFiat,
        formattedBalanceSats,
        formattedPercent,
        receiveDisabled,
        sendDisabled,
        disabledMessage,
        federationId,
        balanceDisplay,
        dispatch,
        handleAutoSelect,
    ])

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.PageHeader
                    title={t('words.wallet')}
                    onAddPress={() => router.push('/onboarding')}
                    onMenuPress={
                        loadedFederations.length >= 2
                            ? () => setOpen(true)
                            : undefined
                    }
                />
                <Layout.Content fullWidth>{content}</Layout.Content>
            </Layout.Root>
            <SelectWalletOverlay open={open} onOpenChange={setOpen} />
        </ContentBlock>
    )
}

const BalanceCard = styled('div', {
    backgroundColor: theme.colors.white,
    fediGradient: 'white',
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    padding: theme.spacing.md,
    border: `1px solid ${theme.colors.extraLightGrey}`,
    borderRadius: 16,
})

const BalanceHeader = styled('button', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
})

const PaymentFederationHeader = styled('button', {
    width: '100%',
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: 0,
})

const SetupContainer = styled(Column, {
    minHeight: '100%',
    width: '100%',
    padding: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
})

const TooltipLink = styled('span', {
    color: theme.colors.link,
    textDecoration: 'underline',
    cursor: 'pointer',
})

const WalletContainer = styled('div', {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    gap: theme.spacing.lg,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
})

export default WalletPage
