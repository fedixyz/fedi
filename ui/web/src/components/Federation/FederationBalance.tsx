import { styled } from '@stitches/react'
import { useTranslation } from 'react-i18next'

import { theme } from '@fedi/common/constants/theme'
import { useBalance } from '@fedi/common/hooks/amount'
import { selectLoadedFederation } from '@fedi/common/redux'

import { useAppSelector } from '../../hooks'
import { FederationAvatar } from '../FederationAvatar'
import { Column } from '../Flex'
import { Text } from '../Text'

export default function FederationBalance({
    federationId,
}: {
    federationId: string
}) {
    const { t } = useTranslation()
    const { formattedBalance } = useBalance(t, federationId)

    const federation = useAppSelector(s =>
        selectLoadedFederation(s, federationId),
    )

    return (
        federation && (
            <BalanceContainer>
                <FederationAvatar federation={federation} size="md" />
                <Column grow>
                    <Text weight="medium">{federation.name}</Text>
                    <Text css={{ color: theme.colors.grey }} variant="caption">
                        {formattedBalance}
                    </Text>
                </Column>
            </BalanceContainer>
        )
    )
}

const BalanceContainer = styled('div', {
    backgroundColor: theme.colors.grey50,
    padding: theme.spacing.sm,
    borderRadius: 16,
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
})
