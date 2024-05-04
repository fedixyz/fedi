import Image, { StaticImageData } from 'next/image'
import Link from 'next/link'
import React from 'react'
import { useTranslation } from 'react-i18next'

import DefaultFediModIcon from '@fedi/common/assets/images/fedimods/default.png'
import { selectFederationFediMods } from '@fedi/common/redux'

import { FEDIMOD_IMAGES } from '../constants/fedimodimages'
import { useAppSelector } from '../hooks'
import { styled } from '../styles'
import { Text } from './Text'

export const FediModTiles: React.FC = () => {
    const fediMods = useAppSelector(selectFederationFediMods)
    const { t } = useTranslation()

    return (
        <Container>
            {fediMods.map(fediMod => {
                const image =
                    fediMod.imageUrl ||
                    FEDIMOD_IMAGES[fediMod.id] ||
                    DefaultFediModIcon
                return (
                    <FediModTile
                        key={fediMod.id}
                        href={fediMod.url}
                        title={fediMod.title}
                        image={image}
                    />
                )
            })}

            {/* Hardcoded for now */}
            <FediModTile
                href="/bug-report"
                title={t('feature.bug.report-a-bug')}
                image={FEDIMOD_IMAGES['bug-report'] as StaticImageData}
            />
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
            {typeof image === 'string' ? (
                <FediModIcon src={image} alt="" />
            ) : (
                <FediModIcon
                    as={Image}
                    src={image}
                    alt=""
                    width={48}
                    height={48}
                />
            )}
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

const FediModIcon = styled('img', {
    width: 48,
    height: 48,
    borderRadius: 12,
})

const FediModTitle = styled('div', {
    margin: '0 -16px',
    maxWidth: '100%',
    minWidth: 0,
})
