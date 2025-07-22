import Image from 'next/image'
import Link from 'next/link'
import React, { useState } from 'react'

import DefaultFediModIcon from '@fedi/common/assets/images/fedimods/default.png'
import { selectAllVisibleMods } from '@fedi/common/redux/mod'
import { FediMod } from '@fedi/common/types'

import { FEDIMOD_IMAGES } from '../constants/fedimodimages'
import { useAppSelector } from '../hooks'
import { styled } from '../styles'
import { Text } from './Text'

type Props = {
    mods?: FediMod[]
}

export const FediModTiles: React.FC<Props> = ({ mods }) => {
    const defaultMods = useAppSelector(selectAllVisibleMods)

    const fediMods = mods || defaultMods

    return (
        <Container>
            {fediMods.map(mod => (
                <FediModTile
                    key={mod.id}
                    id={mod.id}
                    href={mod.url}
                    title={mod.title}
                    image={mod.imageUrl || ''}
                />
            ))}
        </Container>
    )
}

const FediModTile = ({
    id,
    href,
    image,
    title,
}: {
    id: string
    href: string
    image: string
    title: string
}) => {
    const isExternal = href.startsWith('http')
    const [imageError, setImageError] = useState(false)

    return (
        <FediModTileBase
            href={href}
            as={isExternal ? undefined : Link}
            target={isExternal ? '_blank' : undefined}
            rel={isExternal ? 'noopener noreferrer' : undefined}>
            <FediModIcon
                src={
                    imageError
                        ? FEDIMOD_IMAGES[id] || DefaultFediModIcon
                        : image
                }
                width={48}
                height={48}
                alt={title || ''}
                onError={() => setImageError(true)}
            />

            <FediModTitle>
                <Text variant="small" ellipsize>
                    {title}
                </Text>
            </FediModTitle>
        </FediModTileBase>
    )
}

const Container = styled('div', {
    alignItems: 'end',
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    justifyContent: 'space-between',
    width: '100%',

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
