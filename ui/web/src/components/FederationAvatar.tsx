import React from 'react'

import { FederationListItem } from '@fedi/common/types'
import { getFederationIconUrl } from '@fedi/common/utils/FederationUtils'

import { Avatar, AvatarProps } from './Avatar'

type Props = Omit<AvatarProps, 'id' | 'shape' | 'name'> & {
    federation: Pick<FederationListItem, 'id' | 'name' | 'meta'>
}

export const FederationAvatar: React.FC<Props> = ({ federation, ...props }) => {
    const iconUrl = getFederationIconUrl(federation.meta)

    return (
        <Avatar
            id={federation.id}
            shape="square"
            src={iconUrl || undefined}
            name={federation.name}
            {...props}
        />
    )
}
