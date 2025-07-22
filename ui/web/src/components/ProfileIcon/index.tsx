import Image from 'next/image'

import UserIcon from '@fedi/common/assets/svgs/profile.svg'

import { styled, theme } from '../../styles'
import { Icon } from '../Icon'

type Props = {
    url?: string
}

export const ProfileIcon: React.FC<Props> = ({ url }) => {
    if (url) {
        return (
            <Container>
                <ProfileImage
                    src={url}
                    alt="profile-image"
                    width={36}
                    height={36}
                />
            </Container>
        )
    }

    return (
        <Container>
            <Wrapper>
                <Icon
                    data-testid="empty-profile-icon"
                    icon={UserIcon}
                    size={24}
                />
            </Wrapper>
        </Container>
    )
}

const Container = styled('div', {
    alignItems: 'center',
    boxSizing: 'border-box',
    borderRadius: 9999,
    display: 'flex',
    height: 36,
    holoGradient: '600',
    justifyContent: 'center',
    overflow: 'hidden',
    width: 36,
})

const Wrapper = styled('div', {
    alignItems: 'center',
    background: theme.colors.white,
    borderRadius: 9999,
    boxSizing: 'border-box',
    display: 'flex',
    justifyContent: 'center',
    height: 32,
    width: 32,
})

const ProfileImage = styled(Image, {
    width: 36,
})
