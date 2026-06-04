import Image from 'next/image'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import holoWallet from '@fedi/common/assets/images/holo-wallet.png'
import { WALLET_SERVICE_URL } from '@fedi/common/constants/linking'
import { theme } from '@fedi/common/constants/theme'
import {
    useAutoSelectFederations,
    useIsStabilityPoolEnabledByFederation,
} from '@fedi/common/hooks/federation'
import { useToast } from '@fedi/common/hooks/toast'
import { useWalletButtons } from '@fedi/common/hooks/wallet'
import {
    selectCurrency,
    selectFeatureFlag,
    selectLoadedFederations,
    selectLoadedFederationsByRecency,
    selectPaymentType,
    selectSelectedFederation,
    setPayFromFederationId,
    setPaymentType,
    setSelectedFederationId,
} from '@fedi/common/redux'
import { getCurrencyCode } from '@fedi/common/utils/currency'

import { Button } from '../components/Button'
import { ContentBlock } from '../components/ContentBlock'
import FederationStatusAvatar from '../components/FederationStatusAvatar'
import { Column, Row } from '../components/Flex'
import { Icon } from '../components/Icon'
import { IconButton } from '../components/IconButton'
import * as Layout from '../components/Layout'
import SelectWalletOverlay from '../components/SelectWalletOverlay'
import { Switcher } from '../components/Switcher'
import { Text } from '../components/Text'
import { TourTip } from '../components/TourTip'
import { WalletBalanceCard } from '../components/WalletBalanceCard'
import {
    federationRoute,
    onboardingRoute,
    requestRoute,
    sendRoute,
    stabilityDepositRoute,
} from '../constants/routes'
import { useAppDispatch, useAppSelector } from '../hooks'
import { styled } from '../styles'

function WalletPage() {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const router = useRouter()
    const toast = useToast()

    const paymentType = useAppSelector(selectPaymentType)
    const federation = useAppSelector(selectSelectedFederation)
    const federationId = federation?.id ?? ''
    const loadedFederations = useAppSelector(selectLoadedFederations)
    const loadedFederationsByRecency = useAppSelector(
        selectLoadedFederationsByRecency,
    )
    const { receiveDisabled, sendDisabled, disabledMessage } = useWalletButtons(
        t,
        federationId,
    )
    const selectedCurrency = useAppSelector(s =>
        selectCurrency(s, federationId),
    )
    const showStableBalanceWeb = useAppSelector(s =>
        Boolean(selectFeatureFlag(s, 'show_stable_balance_web')),
    )

    const stabilityPoolEnabledByFederation =
        useIsStabilityPoolEnabledByFederation(federationId)
    const shouldShowStableBalanceSwitcher =
        showStableBalanceWeb && stabilityPoolEnabledByFederation

    const currencyCode = getCurrencyCode(selectedCurrency)

    const [open, setOpen] = useState(false)
    const [tooltipOpen, setTooltipOpen] = useState(false)

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

    // If the stable-balance switcher is hidden, keep the selected tab on bitcoin.
    useEffect(() => {
        if (!shouldShowStableBalanceSwitcher) {
            dispatch(setPaymentType('bitcoin'))
        }
    }, [dispatch, shouldShowStableBalanceSwitcher])

    const handleOnReceive = useCallback(() => {
        dispatch(setPayFromFederationId(federationId))

        if (paymentType === 'stable-balance') {
            router.push(stabilityDepositRoute(federationId))
            return
        }

        router.push(requestRoute)
    }, [dispatch, federationId, paymentType, router])

    const content =
        loadedFederations.length === 0 ? (
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
                                {t('feature.wallet.setup-tooltip-before-link')}
                                <TooltipLink
                                    onClick={() =>
                                        window.open(
                                            WALLET_SERVICE_URL,
                                            '_blank',
                                        )
                                    }>
                                    {t('feature.wallet.setup-tooltip-link')}
                                </TooltipLink>
                                {t('feature.wallet.setup-tooltip-after-link')}
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
        ) : federation ? (
            <WalletContainer>
                <PaymentFederationHeader
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(federationRoute(federationId))}
                    onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            router.push(federationRoute(federationId))
                        }
                    }}>
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

                {shouldShowStableBalanceSwitcher ? (
                    <Switcher<'bitcoin' | 'stable-balance'>
                        options={[
                            {
                                label: t('words.bitcoin'),
                                value: 'bitcoin',
                            },
                            {
                                label: currencyCode,
                                value: 'stable-balance',
                            },
                        ]}
                        onChange={type => dispatch(setPaymentType(type))}
                        selected={paymentType}
                    />
                ) : null}

                <WalletBalanceCard federationId={federationId} />

                <Row align="center" gap="md">
                    <Button
                        icon="ArrowDown"
                        width="full"
                        disabled={receiveDisabled}
                        onClick={handleOnReceive}>
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
        ) : null

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

const PaymentFederationHeader = styled('div', {
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
