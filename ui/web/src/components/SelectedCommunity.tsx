import { useRouter } from 'next/router'
import React from 'react'

import ChevronRightIcon from '@fedi/common/assets/svgs/chevron-right.svg'
import { theme } from '@fedi/common/constants/theme'
import { Community } from '@fedi/common/types'

import { styled } from '../styles'
import { FederationAvatar } from './FederationAvatar'
import { Icon } from './Icon'
import { Text } from './Text'

export type Props = {
    community: Community
}

const SelectedCommunity: React.FC<Props> = ({ community }) => {
    const router = useRouter()

    const goToCommunityDetails = () => {
        router.push(`/community-details/${community.id}`)
    }

    return (
        <Container onClick={goToCommunityDetails}>
            <FederationAvatar federation={community} size="md" />
            <CommunityName>
                <Text variant="h2" weight="bold">
                    {community?.name}
                </Text>
            </CommunityName>
            <ChevronContainer>
                <Icon
                    icon={ChevronRightIcon}
                    size="sm"
                    color={theme.colors.primary}
                />
            </ChevronContainer>
        </Container>
    )
}

const Container = styled('div', {
    width: '100%',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    cursor: 'pointer',
    padding: '2px 0 16px',
})

const CommunityName = styled('div', {
    flex: 1,
    '& h2': {
        color: theme.colors.night,
    },
})

const ChevronContainer = styled('div', {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
})

export default SelectedCommunity
