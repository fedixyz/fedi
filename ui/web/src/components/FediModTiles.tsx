import Image, { StaticImageData } from 'next/image'
import Link from 'next/link'
import React from 'react'

import DefaultFediModIcon from '@fedi/common/assets/images/fedimods/default.png'
import {
    selectCoreMods,
    selectVisibleCommunityMods,
} from '@fedi/common/redux/mod'

import { FEDIMOD_IMAGES } from '../constants/fedimodimages'
import { useAppSelector } from '../hooks'
import { styled } from '../styles'
import { Text } from './Text'

type Props = {
    isFederation?: boolean
}

export const FediModTiles: React.FC<Props> = ({ isFederation }) => {
    const fediMods = useAppSelector(
        isFederation ? selectVisibleCommunityMods : selectCoreMods,
    )

    return (
        <Container>
            {fediMods.map(fediMod => (
                <FediModTile
                    key={fediMod.id}
                    href={fediMod.url}
                    title={fediMod.title}
                    image={
                        fediMod.imageUrl ||
                        FEDIMOD_IMAGES[fediMod.id] ||
                        DefaultFediModIcon
                    }
                />
            ))}
        </Container>
    )
}

const FediModTile = ({
    href,
    image,
    title,
}: {
    href: string
    image: string | StaticImageData
    title: string
}) => {
    const isExternal = href.startsWith('http')

    return (
        <FediModTileBase
            href={href}
            as={isExternal ? undefined : Link}
            target={isExternal ? '_blank' : undefined}
            rel={isExternal ? 'noopener noreferrer' : undefined}>
            <FediModIcon src={image} width={48} height={48} alt={title || ''} />

            <FediModTitle>
                <Text variant="small" ellipsize>
                    {title}
                </Text>
            </FediModTitle>
        </FediModTileBase>
    )
}

const Container = styled('div', {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    alignItems: 'end',
    justifyContent: 'space-between',

    '@sm': {
        gridTemplateColumns: 'repeat(3, 1fr)',
        justifyContent: 'space-evenly',
    },
    '@xs': {
        gridTemplateColumns: 'repeat(2, 1fr)',
    },
})

const FediModTileBase = styled('a', {
    display: 'inline-flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center',
    gap: 8,
    width: 96,
    height: 96,
    padding: 4,
    margin: '0 auto',
    borderRadius: 8,
    transition: 'background-color 80ms ease',
    overflow: 'hidden',

    '&:hover, &:focus': {
        background: `rgba(0, 0, 0, 0.04)`,
    },
})

const FediModIcon = styled(Image, {
    width: 48,
    height: 48,
    borderRadius: 12,
})

const FediModTitle = styled('div', {
    margin: '0 -16px',
    maxWidth: '100%',
    minWidth: 0,
})
