import React from 'react'

import { selectLastUsedFederation } from '@fedi/common/redux/federation'

import { useAppSelector } from '../hooks'
import { styled, theme } from '../styles'
import FederationTile from './FederationTile'

const FeaturedFederation: React.FC = () => {
    const lastUsedFederation = useAppSelector(selectLastUsedFederation)

    return (
        <Container>
            {lastUsedFederation && (
                <FederationTile federation={lastUsedFederation} />
            )}
        </Container>
    )
}

const Container = styled('div', {
    fediGradient: 'sky',
    padding: theme.spacing.lg,
    borderRadius: 16,
    '@sm': {
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
    },
})

export default FeaturedFederation
