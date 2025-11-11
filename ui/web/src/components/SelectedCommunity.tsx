import { useRouter } from 'next/router'
import React from 'react'

import ChevronRightIcon from '@fedi/common/assets/svgs/chevron-right.svg'
import QrCodeIcon from '@fedi/common/assets/svgs/qr.svg'
import { theme } from '@fedi/common/constants/theme'
import { Community } from '@fedi/common/types'

import { communityRoute } from '../constants/routes'
import { styled } from '../styles'
import { FederationAvatar } from './FederationAvatar'
import { Row } from './Flex'
import { Icon } from './Icon'
import { Text } from './Text'

export type Props = {
    community: Community
    onQrClick: () => void
}

const SelectedCommunity: React.FC<Props> = ({ community, onQrClick }) => {
    const router = useRouter()

    return (
        <Container onClick={() => router.push(communityRoute(community.id))}>
            <FederationAvatar federation={community} size="md" />
            <CommunityName align="center" justify="between">
                <Text variant="h2" weight="bold">
                    {community?.name}
                </Text>
                <IconWrapper
                    onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                        e.stopPropagation()
                        onQrClick()
                    }}>
                    <Icon
                        icon={QrCodeIcon}
                        size="sm"
                        color={theme.colors.primary}
                    />
                </IconWrapper>
            </CommunityName>
            <ChevronContainer align="center" shrink={false}>
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
})

const CommunityName = styled(Row, {
    flex: 1,

    '& h2': {
        color: theme.colors.night,
    },
})

const IconWrapper = styled('div', {
    display: 'flex',
    flexShrink: 0,
})

const ChevronContainer = styled(Row, {})

export default SelectedCommunity
