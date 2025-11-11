import React from 'react'

import QRIcon from '@fedi/common/assets/svgs/qr.svg'
import { theme } from '@fedi/common/constants/theme'
import { Community } from '@fedi/common/types'
import { shouldShowInviteCode } from '@fedi/common/utils/FederationUtils'

import { styled } from '../styles'
import { FederationAvatar } from './FederationAvatar'
import { Icon } from './Icon'
import { Text } from './Text'

type CommunityTileProps = {
    community: Community
    onSelect?: () => void
    onSelectQr?: () => void
    showQr?: boolean
}

const CommunityTile: React.FC<CommunityTileProps> = ({
    community,
    onSelect = () => null,
    onSelectQr = () => null,
}) => {
    const showInviteCode = shouldShowInviteCode(community.meta)

    return (
        <Container onClick={onSelect}>
            <FederationAvatar federation={community} size="md" />
            <CommunityInfo>
                <Text variant="body" weight="bold" ellipsize>
                    {community.name}
                </Text>
            </CommunityInfo>
            {showInviteCode && (
                <IconContainer>
                    <Icon
                        icon={QRIcon}
                        size="sm"
                        onClick={(e: React.MouseEvent<SVGElement>) => {
                            e.stopPropagation()
                            onSelectQr()
                        }}
                    />
                </IconContainer>
            )}
        </Container>
    )
}

const Container = styled('div', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: theme.spacing.lg,
    padding: 8,
    cursor: 'pointer',
    borderRadius: 12,
    transition: 'background-color 0.2s ease',

    '&:hover': {
        backgroundColor: theme.colors.primary05,
    },
})

const CommunityInfo = styled('div', {
    flex: 1,
    minWidth: 0,
})

const IconContainer = styled('div', {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'center',
})

export default CommunityTile
