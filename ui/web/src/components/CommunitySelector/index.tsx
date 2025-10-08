import { useRouter } from 'next/router'
import React, { useState } from 'react'

import ChevronDownIcon from '@fedi/common/assets/svgs/chevron-down.svg'
import { selectCommunities, selectCommunityStack } from '@fedi/common/redux'

import { onboardingRoute } from '../../constants/routes'
import { useAppSelector } from '../../hooks'
import { styled, theme } from '../../styles'
import AvatarStack from '../AvatarStack'
import CommunitiesOverlay from '../CommunitiesOverlay'
import { FederationAvatar } from '../FederationAvatar'
import { Icon } from '../Icon'

type Props = {
    onClick?(): void
}

export const CommunitySelector: React.FC<Props> = ({ onClick }) => {
    const { push } = useRouter()
    const communities = useAppSelector(selectCommunities)
    const communityStack = useAppSelector(selectCommunityStack)
    const [showCommunities, setShowCommunities] = useState(false)

    const handleClick = () => {
        if (communities.length === 0) {
            push(onboardingRoute)
        } else {
            setShowCommunities(true)
            onClick?.()
        }
    }

    return (
        <>
            <Container onClick={handleClick}>
                <Wrapper>
                    <AvatarStack
                        data={communityStack}
                        renderAvatar={item => (
                            <FederationAvatar federation={item} size="sm" />
                        )}
                        stackDirection="rtl"
                        size={32}
                    />
                    <Icon icon={ChevronDownIcon} size="sm" />
                </Wrapper>
            </Container>
            <CommunitiesOverlay
                open={showCommunities}
                onOpenChange={setShowCommunities}
            />
        </>
    )
}

const Container = styled('div', {
    boxSizing: 'border-box',
    borderRadius: 9999,
    cursor: 'pointer',
    fediGradient: 'sky-banner',
    padding: 2,
    overflow: 'none',
})

const Wrapper = styled('div', {
    alignItems: 'center',
    background: theme.colors.white,
    borderRadius: 9999,
    display: 'flex',
    gap: 10,
    justifyContent: 'center',
    fediGradient: 'white',
    padding: theme.spacing.xs,
    paddingRight: theme.spacing.md,
    '& > button': {
        display: 'block',
    },
})
