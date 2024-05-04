import { useRouter } from 'next/router'
import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import ErrorIcon from '@fedi/common/assets/svgs/error.svg'

import { styled } from '../styles'
import { Button } from './Button'
import { ContentBlock } from './ContentBlock'
import { Icon } from './Icon'
import { Text } from './Text'

export const PageError: React.FC = () => {
    const { t } = useTranslation()
    const { pathname } = useRouter()

    const isHome = pathname === '/'

    const handleReset = useCallback(() => {
        window.location.pathname = '/'
    }, [])

    return (
        <ContentBlock>
            <Container>
                <Icon icon={ErrorIcon} size="lg" />
                <Text variant="h2" weight="medium">
                    {t('errors.unknown-error')}
                </Text>
                <Button onClick={handleReset}>
                    {t(
                        isHome
                            ? 'phrases.reload-app'
                            : 'phrases.return-to-home',
                    )}
                </Button>
            </Container>
        </ContentBlock>
    )
}

const Container = styled('div', {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    gap: 16,
})
