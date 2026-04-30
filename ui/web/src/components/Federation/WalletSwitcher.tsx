import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useBalance } from '@fedi/common/hooks/amount'
import {
    selectLoadedFederation,
    selectPaymentFederation,
} from '@fedi/common/redux'

import { useAppSelector } from '../../hooks'
import { styled, theme } from '../../styles'
import { FederationAvatar } from '../FederationAvatar'
import FederationsOverlay from '../FederationsOverlay'
import { Column } from '../Flex'
import { Icon } from '../Icon'
import { Text } from '../Text'

export default function WalletSwitcher() {
    const [isOpen, setIsOpen] = useState(false)

    const paymentFederation = useAppSelector(selectPaymentFederation)
    const federationId = paymentFederation?.id || ''
    const federation = useAppSelector(s =>
        selectLoadedFederation(s, federationId),
    )

    const { t } = useTranslation()
    const { formattedBalance } = useBalance(t, federationId)

    if (!federation) return null

    return (
        <>
            <BalanceContainer onClick={() => setIsOpen(true)}>
                <FederationAvatar federation={federation} size="md" />
                <Column grow>
                    <Text weight="medium">{federation.name}</Text>
                    <Text css={{ color: theme.colors.grey }} variant="caption">
                        {formattedBalance}
                    </Text>
                </Column>
                <Icon icon="ChevronRight" size="sm" />
            </BalanceContainer>
            <FederationsOverlay open={isOpen} onOpenChange={setIsOpen} />
        </>
    )
}

const BalanceContainer = styled('button', {
    backgroundColor: theme.colors.grey50,
    padding: theme.spacing.sm,
    borderRadius: 16,
    display: 'flex',
    alignItems: 'center',
    textAlign: 'left',
    gap: theme.spacing.sm,
    width: '100%',

    '&:hover, &:active': {
        backgroundColor: theme.colors.grey100,
    },
})
