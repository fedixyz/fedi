import Image from 'next/image'
import { useTranslation } from 'react-i18next'

import FederationCreateImage from '@fedi/common/assets/images/federation-create-graphic.png'
import ShieldHalfFilledIcon from '@fedi/common/assets/svgs/shield-half-filled.svg'
import UsersIcon from '@fedi/common/assets/svgs/social-people.svg'
import UserIcon from '@fedi/common/assets/svgs/user.svg'

import { styled, theme } from '../styles'
import { Icon } from './Icon'
import { Text } from './Text'

type InfoEntryItem = {
    icon: React.FunctionComponent<React.SVGAttributes<SVGElement>>
    text: string
}

const InfoEntryList: React.FC<{ items: InfoEntryItem[] }> = ({ items }) => {
    return (
        <InfoListContainer>
            {items.map((item, index) => (
                <InfoEntryListItem key={index}>
                    <IconWrapper>
                        <Icon icon={item.icon} size={24} />
                    </IconWrapper>
                    <Text
                        variant="caption"
                        css={{
                            color: theme.colors.darkGrey,
                            textAlign: 'left',
                            flex: 1,
                        }}>
                        {item.text}
                    </Text>
                </InfoEntryListItem>
            ))}
        </InfoListContainer>
    )
}

export default function CreateFederation() {
    const { t } = useTranslation()

    const createInfoItems: InfoEntryItem[] = [
        {
            icon: UserIcon,
            text: t('feature.onboarding.create-info-1'),
        },
        {
            icon: UsersIcon,
            text: t('feature.onboarding.create-info-3'),
        },
        {
            icon: ShieldHalfFilledIcon,
            text: t('feature.onboarding.create-info-5'),
        },
    ]

    return (
        <CreateContainer>
            <CreateContentWrapper>
                <ImageWrapper>
                    <Image
                        src={FederationCreateImage}
                        alt="Create Federation"
                        style={{ width: '100%', height: 'auto' }}
                    />
                </ImageWrapper>
                <InfoEntryList items={createInfoItems} />
            </CreateContentWrapper>
        </CreateContainer>
    )
}

const CreateContainer = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
})

const CreateContentWrapper = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    flex: 1,
})

const ImageWrapper = styled('div', {
    maxWidth: '100%',
    height: 'auto',
})

const InfoListContainer = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
})

const InfoEntryListItem = styled('div', {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
})

const IconWrapper = styled('div', {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: theme.colors.night,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,

    '& svg': {
        color: theme.colors.white,
    },
})
