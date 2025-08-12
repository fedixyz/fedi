import Image from 'next/image'
import React, { useState } from 'react'

import DefaultFediModIcon from '@fedi/common/assets/images/fedimods/default.png'
import { selectAllVisibleMods } from '@fedi/common/redux/mod'
import { FediMod } from '@fedi/common/types'

import { FediModBrowser } from '../components/FediModBrowser'
import { FEDIMOD_IMAGES } from '../constants/fedimodimages'
import { useAppSelector, useDeviceQuery } from '../hooks'
import { styled } from '../styles'
import { Text } from './Text'

type Props = {
    mods?: FediMod[]
}

// We don't have any mods yet but when we do we can add them here
const whitelist: string[] = []

export const FediModTiles: React.FC<Props> = ({ mods }) => {
    const { isMobile } = useDeviceQuery()
    const defaultMods = useAppSelector(selectAllVisibleMods)
    const [modUrl, setModUrl] = useState<string | null>(null)

    const fediMods = mods || defaultMods

    const handleOnClick = (mod: FediMod) => {
        // only show app in FediModBrowser if it is whitelisted and on mobile
        if (whitelist.includes(mod.id) && isMobile) {
            setModUrl(mod.url)
            return
        }

        window.open(mod.url, '_blank')
    }

    return (
        <>
            {!!modUrl && (
                <FediModBrowser url={modUrl} onClose={() => setModUrl(null)} />
            )}
            <Container>
                {fediMods.map(mod => {
                    return (
                        <FediModTile
                            key={mod.id}
                            mod={mod}
                            onClick={handleOnClick}
                        />
                    )
                })}
            </Container>
        </>
    )
}

const FediModTile = ({
    mod,
    onClick,
}: {
    mod: FediMod
    onClick(mod: FediMod): void
}) => {
    const [imageError, setImageError] = useState(false)

    return (
        <FediModTileBase onClick={() => onClick(mod)}>
            <FediModIcon
                src={
                    imageError
                        ? FEDIMOD_IMAGES[mod.id] || DefaultFediModIcon
                        : mod.imageUrl || ''
                }
                width={48}
                height={48}
                alt={mod.title || ''}
                onError={() => setImageError(true)}
            />

            <FediModTitle>
                <Text variant="small" ellipsize>
                    {mod.title}
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

const FediModTileBase = styled('div', {
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
