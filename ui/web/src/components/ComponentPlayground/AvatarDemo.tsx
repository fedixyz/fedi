import React from 'react'

import SocialPeopleIcon from '@fedi/common/assets/svgs/social-people.svg'

import { Avatar } from '../../components/Avatar'
import { styled } from '../../styles'

export const AvatarDemo: React.FC = () => {
    const sizes = ['lg', 'md', 'sm', 'xs'] as const
    const shapes = ['circle', 'square'] as const

    return (
        <Container>
            {shapes.map(shape => (
                <AvatarGroup key={shape}>
                    {sizes.map(size => (
                        <AvatarRow key={size}>
                            <Avatar
                                id="one"
                                src="https://images.unsplash.com/photo-1511485977113-f34c92461ad9?ixlib=rb-1.2.1&w=128&h=128&dpr=2&q=80"
                                name="Test Dude"
                                shape={shape}
                                size={size}
                            />
                            <Avatar
                                id="two"
                                name="Test Dude"
                                shape={shape}
                                size={size}
                            />
                            <Avatar
                                id="three"
                                name="Test Dude"
                                shape={shape}
                                size={size}
                                icon={SocialPeopleIcon}
                                holo
                            />
                        </AvatarRow>
                    ))}
                </AvatarGroup>
            ))}
        </Container>
    )
}

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 40,
})

const AvatarGroup = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
})

const AvatarRow = styled('div', {
    display: 'flex',
    gap: 10,
})
