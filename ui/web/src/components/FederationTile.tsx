import Link from 'next/link'
import React from 'react'
import { useTranslation } from 'react-i18next'

import chevronRight from '@fedi/common/assets/svgs/chevron-right.svg'
import { selectIsFederationRecovering } from '@fedi/common/redux'
import { LoadedFederation } from '@fedi/common/types'

import { federationRoute } from '../constants/routes'
import { useAppSelector } from '../hooks'
import { styled, theme } from '../styles'
import { BitcoinWallet } from './BitcoinWallet'
import { FederationAvatar } from './FederationAvatar'
import { Icon } from './Icon'
import { RecoveryInProgress } from './RecoveryInProgress'
import { Text } from './Text'

type Props = {
    federation: LoadedFederation
}

const FederationTile: React.FC<Props> = ({ federation }) => {
    const { t } = useTranslation()
    const recoveryInProgress = useAppSelector(s =>
        selectIsFederationRecovering(s, federation.id),
    )

    return (
        <Container>
            <TileHeader as={Link} href={federationRoute(federation.id)}>
                <FederationAvatar federation={federation} size="md" />
                <Text weight="bold" css={{ color: theme.colors.primary }}>
                    {federation?.name}
                </Text>
                <IconContainer>
                    <Icon icon={chevronRight} size={'sm'} />
                </IconContainer>
            </TileHeader>
            {recoveryInProgress ? (
                <RecoveryContainer>
                    <RecoveryInProgress
                        label={t(
                            'feature.recovery.recovery-in-progress-balance',
                        )}
                        federationId={federation.id}
                    />
                </RecoveryContainer>
            ) : (
                <BitcoinWallet federation={federation} />
            )}
        </Container>
    )
}

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
})

const TileHeader = styled('div', {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
})

const IconContainer = styled('button', {
    marginLeft: 'auto',
})

const RecoveryContainer = styled('div', {
    minHeight: 120,
    borderRadius: 20,
    border: `1px solid ${theme.colors.extraLightGrey}`,
})

export default FederationTile
