import { styled } from '@stitches/react'
import { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'

import BitcoinCircleIcon from '@fedi/common/assets/svgs/bitcoin-circle.svg'
import ChevronRightIcon from '@fedi/common/assets/svgs/chevron-right.svg'
import { theme } from '@fedi/common/constants/theme'
import { useBalance } from '@fedi/common/hooks/amount'
import {
    selectLoadedFederationsByRecency,
    setPaymentType,
    setSelectedFederationId,
} from '@fedi/common/redux'
import { LoadedFederation } from '@fedi/common/types'

import { useAppDispatch, useAppSelector } from '../hooks'
import { Dialog } from './Dialog'
import FederationStatusAvatar from './FederationStatusAvatar'
import { Column, Row } from './Flex'
import { Icon } from './Icon'
import { Text } from './Text'

export default function SelectWalletOverlay({
    open,
    onOpenChange,
}: {
    open: boolean
    onOpenChange: Dispatch<SetStateAction<boolean>>
}) {
    const { t } = useTranslation()

    const loadedFederations = useAppSelector(selectLoadedFederationsByRecency)

    return (
        <Dialog
            type="tray"
            title={t('phrases.select-wallet-service')}
            open={open}
            onOpenChange={onOpenChange}>
            <WalletsContainer>
                {loadedFederations.map(f => (
                    <WalletListItem
                        key={`wallet-list-item-${f.id}`}
                        federation={f}
                        onDismiss={() => onOpenChange(false)}
                    />
                ))}
            </WalletsContainer>
        </Dialog>
    )
}

function WalletListItem({
    federation,
    onDismiss,
}: {
    federation: LoadedFederation
    onDismiss: () => void
}) {
    const dispatch = useAppDispatch()

    const handleSelectBitcoin = () => {
        dispatch(setSelectedFederationId(federation.id))
        dispatch(setPaymentType('bitcoin'))
        onDismiss()
    }

    const { t } = useTranslation()
    const { formattedBalance } = useBalance(t, federation.id)

    return (
        <Column gap="sm">
            <Row align="center" gap="md">
                <FederationStatusAvatar federation={federation} size="md" />
                <Text css={{ flexGrow: 1 }} weight="bold">
                    {federation.name}
                </Text>
            </Row>
            <BalanceItem onClick={handleSelectBitcoin}>
                <Icon icon={BitcoinCircleIcon} color={theme.colors.orange} />
                <Text css={{ flexGrow: 1 }}>{t('words.bitcoin')}</Text>
                <Text>{formattedBalance}</Text>
                <Icon icon={ChevronRightIcon} color={theme.colors.grey} />
            </BalanceItem>
        </Column>
    )
}

const BalanceItem = styled('button', {
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
