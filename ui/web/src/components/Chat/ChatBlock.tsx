import React from 'react'
import { useTranslation } from 'react-i18next'

import ErrorIcon from '@fedi/common/assets/svgs/error.svg'
import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'

import { styled, theme } from '../../styles'
import { Icon } from '../Icon'
import { Text } from '../Text'

interface Props {
    children: React.ReactNode
}

export const ChatBlock: React.FC<Props> = ({ children }) => {
    const { t } = useTranslation()

    return (
        <Container>
            <Content>
                <ErrorBoundary
                    fallback={
                        <Error>
                            <Icon icon={ErrorIcon} />
                            <Text variant="h2" weight="normal">
                                {t('errors.unknown-error')}
                            </Text>
                        </Error>
                    }>
                    {children}
                </ErrorBoundary>
            </Content>
        </Container>
    )
}

const Container = styled('div', {
    display: 'flex',
    flex: 1,
    height: 'auto',
    minHeight: 300,
    overflow: 'hidden',
    position: 'relative',
})

const Content = styled('div', {
    bottom: 0,
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
    width: '100%',
})

const Error = styled('div', {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    gap: 8,
    color: theme.colors.red,
})
