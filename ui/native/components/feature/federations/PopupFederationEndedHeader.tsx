import React from 'react'

import Header from '../../ui/Header'
import FederationSelector from './FederationSelector'

const JoinFederationHeader: React.FC = () => {
    return <Header headerCenter={<FederationSelector />} />
}

export default JoinFederationHeader
