import { useRouter } from 'next/router'
import React from 'react'
import { useTranslation } from 'react-i18next'

import {
    selectActiveFederation,
    selectLoadedFederations,
} from '@fedi/common/redux'

import { onboardingRoute } from '../../constants/routes'
import { useAppSelector } from '../../hooks'
import { styled, theme } from '../../styles'
import { FederationAvatar } from '../FederationAvatar'
import { Text } from '../Text'

type Props = {
    onClick(): void
}

export const FederationSelector: React.FC<Props> = ({ onClick }) => {
    const { t } = useTranslation()
    const { push } = useRouter()
    const activeFederation = useAppSelector(selectActiveFederation)
    const federations = useAppSelector(selectLoadedFederations)

    const handler =
        federations.length === 0 ? () => push(onboardingRoute) : onClick
    const text =
        federations.length === 0
            ? t('phrases.join-a-federation')
            : activeFederation?.name

    return (
        <Container onClick={handler}>
            <Wrapper>
                {activeFederation && (
                    <FederationAvatar federation={activeFederation} size="xs" />
                )}
                <Inner>
                    <Text variant="caption" weight="bold">
                        {text}
                    </Text>
                </Inner>
            </Wrapper>
        </Container>
    )
}

const Container = styled('div', {
    boxSizing: 'border-box',
    borderRadius: 9999,
    cursor: 'pointer',
    holoGradient: '600',
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
    padding: '5px 12px',
    '& > button': {
        display: 'block',
    },
})

const Inner = styled('div', {
    alignItems: 'center',
    display: 'flex',
    gap: 8,
})
