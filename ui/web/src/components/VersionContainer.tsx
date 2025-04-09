import Link from 'next/link'
import React from 'react'
import { useTranslation } from 'react-i18next'

import FediIcon from '@fedi/common/assets/svgs/fedi-logo-icon.svg'
import { selectFedimintVersion } from '@fedi/common/redux/environment'

import { useAppSelector } from '../hooks'
import { styled, theme } from '../styles'
import { Text } from './Text'

export const VersionContainer = () => {
    const { t } = useTranslation()
    const fedimintVersion = useAppSelector(selectFedimintVersion)

    return (
        <Menu>
            <FediIcon width={24} />

            <VersionsWrapper>
                <Text variant="small" css={{ color: theme.colors.darkGrey }}>
                    {t('phrases.fedimint-version', {
                        version: fedimintVersion,
                    })}
                </Text>
            </VersionsWrapper>

            <StyledLink href="/share-logs">
                {t('feature.developer.share-logs')}
            </StyledLink>
        </Menu>
    )
}

const Menu = styled('div', {
    alignItems: 'center',
    backgroundColor: theme.colors.offWhite100,
    borderRadius: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    paddingBottom: 12,
    paddingTop: 12,
})

const VersionsWrapper = styled('div', {
    display: 'flex',
    flexDirection: 'column',
})

const StyledLink = styled(Link, {
    fontSize: '12px',
})
