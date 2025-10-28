import React from 'react'

import { selectLastUsedFederation } from '@fedi/common/redux/federation'

import { useAppSelector } from '../hooks'
import FederationTile from './FederationTile'

const FeaturedFederation: React.FC = () => {
    const lastUsedFederation = useAppSelector(selectLastUsedFederation)

    return (
        lastUsedFederation && (
            <FederationTile
                federation={lastUsedFederation}
                expanded
                setExpandedWalletId={() => {}}
            />
        )
    )
}

export default FeaturedFederation
