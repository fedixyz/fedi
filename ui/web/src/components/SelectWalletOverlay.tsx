import { styled } from '@stitches/react'
import { Dispatch, SetStateAction, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { theme } from '@fedi/common/constants/theme'
import { useBalance } from '@fedi/common/hooks/amount'
import { useIsStabilityPoolEnabledByFederation } from '@fedi/common/hooks/federation'
import { useRecoveryProgress } from '@fedi/common/hooks/recovery'
import {
    selectCurrency,
    selectCurrencyLocale,
    selectFeatureFlag,
    selectLoadedFederationsByRecency,
    selectStableBalance,
    setPaymentType,
    setSelectedFederationId,
} from '@fedi/common/redux'
import { LoadedFederation } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { getCurrencyCode } from '@fedi/common/utils/currency'

import { useAppDispatch, useAppSelector } from '../hooks'
import { Dialog } from './Dialog'
import { FederationInviteDialog } from './FederationInviteDialog'
import FederationStatusAvatar from './FederationStatusAvatar'
import { Column, Row } from './Flex'
import { Icon } from './Icon'
import { IconButton } from './IconButton'
import { Text } from './Text'

type WalletBalanceType = 'bitcoin' | 'stable-balance'

export default function SelectWalletOverlay({
    open,
    onOpenChange,
}: {
    open: boolean
    onOpenChange: Dispatch<SetStateAction<boolean>>
}) {
    const [federationInviteId, setFederationInviteId] = useState<string | null>(
        null,
    )
    const { t } = useTranslation()

    const loadedFederations = useAppSelector(selectLoadedFederationsByRecency)

    return (
        <>
            <Dialog
                type="tray"
                title={t('phrases.select-wallet-service')}
                open={open && !federationInviteId}
                onOpenChange={onOpenChange}>
                <WalletsContainer>
                    {loadedFederations.map(f => (
                        <WalletListItem
                            key={`wallet-list-item-${f.id}`}
                            federation={f}
                            onOpenChange={onOpenChange}
                            onClickInvite={setFederationInviteId}
                        />
                    ))}
                </WalletsContainer>
            </Dialog>
            <FederationInviteDialog
                open={Boolean(open && federationInviteId)}
                federationId={federationInviteId ?? ''}
                onClose={() => setFederationInviteId(null)}
            />
        </>
    )
}

function WalletListItem({
    federation,
    onOpenChange,
    onClickInvite,
}: {
    federation: LoadedFederation
    onOpenChange: Dispatch<SetStateAction<boolean>>
    onClickInvite: (federationId: string) => void
}) {
    const dispatch = useAppDispatch()

    const supportsStabilityPool = useIsStabilityPoolEnabledByFederation(
        federation.id,
    )
    const showStableBalance = useAppSelector(s =>
        Boolean(selectFeatureFlag(s, 'show_stable_balance_web')),
    )
    const { recoveryInProgress } = useRecoveryProgress(federation.id)

    const handleSelectBalance = (type: WalletBalanceType) => {
        dispatch(setSelectedFederationId(federation.id))
        dispatch(setPaymentType(type))
        onOpenChange(false)
    }

    return (
        <Column gap="sm">
            <Row align="center" gap="md">
                <FederationAvatarWrapper>
                    <FederationStatusAvatar federation={federation} size="sm" />
                </FederationAvatarWrapper>
                <Text css={{ flexGrow: 1 }} weight="bold">
                    {federation.name}
                </Text>
                <IconButton
                    icon="Qr"
                    size="md"
                    onClick={() => onClickInvite(federation.id)}
                />
            </Row>
            {!recoveryInProgress && (
                <>
                    <BalanceItem
                        type="bitcoin"
                        federation={federation}
                        onClick={() => handleSelectBalance('bitcoin')}
                    />
                    {supportsStabilityPool && showStableBalance && (
                        <BalanceItem
                            type="stable-balance"
                            federation={federation}
                            onClick={() =>
                                handleSelectBalance('stable-balance')
                            }
                        />
                    )}
                </>
            )}
        </Column>
    )
}

function BalanceItem({
    type,
    federation,
    onClick,
}: {
    type: WalletBalanceType
    federation: LoadedFederation
    onClick: () => void
}) {
    const { t } = useTranslation()
    const selectedCurrency = useAppSelector(s =>
        selectCurrency(s, federation.id),
    )
    const stableBalance = useAppSelector(s =>
        selectStableBalance(s, federation.id),
    )
    const currencyLocale = useAppSelector(selectCurrencyLocale)
    const { formattedBalance } = useBalance(t, federation.id)
    const currencyCode = getCurrencyCode(selectedCurrency)
    const formattedStableBalance = amountUtils.formatFiat(
        stableBalance,
        selectedCurrency,
        { symbolPosition: 'end', locale: currencyLocale },
    )

    if (type === 'stable-balance') {
        return (
            <BalanceItemButton onClick={onClick}>
                <Icon icon="UsdCircleFilled" color={theme.colors.moneyGreen} />
                <Text css={{ flexGrow: 1, textAlign: 'left' }}>
                    {currencyCode}
                </Text>
                <Text variant="caption">{formattedStableBalance}</Text>
                <Icon icon="ChevronRight" color={theme.colors.grey} size={20} />
            </BalanceItemButton>
        )
    }

    return (
        <BalanceItemButton onClick={onClick}>
            <Icon icon="BitcoinCircle" color={theme.colors.orange} />
            <Text css={{ flexGrow: 1, textAlign: 'left' }}>
                {t('words.bitcoin')}
            </Text>
            <Text variant="caption">{formattedBalance}</Text>
            <Icon icon="ChevronRight" color={theme.colors.grey} size={20} />
        </BalanceItemButton>
    )
}

const FederationAvatarWrapper = styled('div', {
    padding: theme.spacing.xs,
})

const BalanceItemButton = styled('button', {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
    width: '100%',
    borderRadius: 16,
    border: `1px solid ${theme.colors.extraLightGrey}`,
})

const WalletsContainer = styled(Column, {
    gap: theme.spacing.md,
    maxHeight: '60vh',
    overflow: 'auto',
})
