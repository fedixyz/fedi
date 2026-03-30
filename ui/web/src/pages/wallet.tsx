import { useRouter } from 'next/router'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import ArrowDown from '@fedi/common/assets/svgs/arrow-down.svg'
import ArrowUp from '@fedi/common/assets/svgs/arrow-up.svg'
import BitcoinCircle from '@fedi/common/assets/svgs/bitcoin-circle.svg'
import ChevronRight from '@fedi/common/assets/svgs/chevron-right.svg'
import HelpIcon from '@fedi/common/assets/svgs/help.svg'
import TxnHistory from '@fedi/common/assets/svgs/txn-history.svg'
import { theme } from '@fedi/common/constants/theme'
import { useBalance } from '@fedi/common/hooks/amount'
import { usePopupFederationInfo } from '@fedi/common/hooks/federation'
import { useRecoveryProgress } from '@fedi/common/hooks/recovery'
import {
    selectLoadedFederations,
    selectReceivesDisabled,
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

    const [open, setOpen] = useState(false)
    const [tooltipOpen, setTooltipOpen] = useState(false)

    const federation = useAppSelector(selectSelectedFederation)
    const federationId = federation?.id ?? ''
    const loadedFederations = useAppSelector(selectLoadedFederations)
    const { recoveryInProgress, formattedPercent } =
        useRecoveryProgress(federationId)
    const receivesDisabled = useAppSelector(s =>
        selectReceivesDisabled(s, federationId),
    )

    const { formattedBalanceSats, formattedBalanceFiat } = useBalance(
        t,
        federationId,
    )
    const popupInfo = usePopupFederationInfo(federation?.meta ?? {})
    const dispatch = useAppDispatch()
    const router = useRouter()

    useEffect(() => {
        if (loadedFederations.length > 0 && !federation)
            dispatch(setSelectedFederationId(loadedFederations[0].id))
    }, [federation, loadedFederations, dispatch])

    const receiveDisabled =
        popupInfo?.ended || receivesDisabled || recoveryInProgress
    const sendDisabled = popupInfo?.ended || recoveryInProgress

    const disabledMessage = useMemo(() => {
        if (recoveryInProgress)
            return t('feature.recovery.recovery-in-progress-wallet')

        if (receivesDisabled) return t('errors.receives-have-been-disabled')

        return null
    }, [recoveryInProgress, receivesDisabled, t])

    const content = useMemo(() => {
        if (loadedFederations.length === 0) {
            return (
                <Empty grow center gap="md">
                    <EmptyContainer align="center" gap="md" fullWidth>
                        <Text weight="bold">
                            {t('feature.federations.no-federations')}
                        </Text>
                        <Text variant="caption">
                            {t('feature.wallet.join-federation')}
                        </Text>
                    </EmptyContainer>
                    <Button
                        onClick={() => router.push(onboardingRoute)}
                        width="full">
                        {t('phrases.join-a-federation')}
                    </Button>
                </Empty>
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
                            icon={HelpIcon}
                            size="md"
                            style={{ color: theme.colors.darkGrey }}
                            onClick={e => {
                                e.stopPropagation()
                                setTooltipOpen(true)
                            }}
                        />
                    </TourTip>
                    <Icon icon={ChevronRight} color={theme.colors.darkGrey} />
                </PaymentFederationHeader>
                <BalanceCard>
                    <BalanceHeader
                        onClick={() => router.push(transactionsRoute)}>
                        <Row gap="sm" align="center">
                            <Icon
                                icon={BitcoinCircle}
                                color={theme.colors.orange}
                            />
                            <Text weight="bold">{t('words.bitcoin')}</Text>
                        </Row>

                        <Icon icon={TxnHistory} size="sm" />
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
                                    {formattedBalanceFiat}
                                </Text>
                                <Text css={{ color: theme.colors.grey }}>
                                    {formattedBalanceSats}
                                </Text>
                            </>
                        )}
                    </Column>
                </BalanceCard>
                <Row align="center" gap="md">
                    <Button
                        icon={ArrowDown}
                        width="full"
                        disabled={receiveDisabled}
                        onClick={() => {
                            dispatch(setPayFromFederationId(federationId))
                            router.push(requestRoute)
                        }}>
                        {t('words.receive')}
                    </Button>
                    <Button
                        icon={ArrowUp}
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
        dispatch,
    ])

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.PageHeader
                    title={t('words.wallet')}
                    onAddPress={() => router.push('/onboarding')}
                    onMenuPress={() => setOpen(true)}
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

const Empty = styled(Column, {
    paddingLeft: theme.spacing.lg,
    paddingRight: theme.spacing.lg,
})

const EmptyContainer = styled(Column, {
    padding: `${theme.spacing.md}px ${theme.spacing.lg}px`,
    border: `1px dashed ${theme.colors.lightGrey}`,
    borderRadius: 16,
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
