import { TFunction } from 'i18next'
import React from 'react'
import { useTranslation } from 'react-i18next'

import ErrorIcon from '@fedi/common/assets/svgs/error.svg'
import { makeLog } from '@fedi/common/utils/log'

import { AppContent, AppContainer } from '../components/Template'
import { styled, theme } from '../styles'
import { Button } from './Button'
import { Icon } from './Icon'
import * as Layout from './Layout'
import { Text } from './Text'

type Props = {
    error: unknown
}

const log = makeLog('AppError')

const getErrorText = (error: Error, t: TFunction) => {
    if (error.name === 'NoModificationAllowedError') {
        return {
            helpText: t('errors.web-no-modification-allowed-error'),
            message: error.message,
        }
    }

    return {
        helpText: t('errors.unknown-error'),
        message: error.message,
    }
}

export const AppError: React.FC<Props> = ({ error }) => {
    const { t } = useTranslation()

    const { helpText, message } = getErrorText(
        error instanceof Error ? error : new Error('Unknown error'),
        t,
    )

    log.error('HIT', message)

    return (
        <AppContainer>
            <AppContent>
                <Layout.Root>
                    <Layout.Content>
                        <Content>
                            <Icon icon={ErrorIcon} size="lg" />
                            <Text variant="h2" weight="medium">
                                {t('errors.something-has-gone-wrong')}
                            </Text>
                            <Text>{helpText}</Text>
                        </Content>
                    </Layout.Content>
                    <Layout.Actions>
                        <Text
                            variant="small"
                            css={{ color: theme.colors.darkGrey }}>
                            {message}
                        </Text>
                        <Button
                            width="full"
                            onClick={() => window.location.reload()}>
                            {t('phrases.reload-page')}
                        </Button>
                        <Button
                            width="full"
                            variant="outline"
                            href="https://support.fedi.xyz">
                            {t('phrases.contact-fedi-support')}
                        </Button>
                    </Layout.Actions>
                </Layout.Root>
            </AppContent>
        </AppContainer>
    )
}

const Content = styled('div', {
    alignItems: 'center',
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    gap: 8,
    justifyContent: 'center',
    textAlign: 'center',
    width: '100%',
})
