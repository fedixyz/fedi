import { Dispatch, SetStateAction, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { styled, theme } from '../../styles'
import { CircularLoader } from '../CircularLoader'
import { Text } from '../Text'

export default function FederationTermsPreview({
    tosUrl,
    isLoaded,
    setIsLoaded,
}: {
    tosUrl: string
    isLoaded: boolean
    setIsLoaded: Dispatch<SetStateAction<boolean>>
}) {
    const { t } = useTranslation()

    const [isError, setIsError] = useState(false)

    useEffect(() => {
        const errorTimeout = setTimeout(() => {
            setIsLoaded(loaded => {
                if (!loaded) {
                    setIsError(true)
                }

                return true
            })
        }, 5000)

        return () => {
            clearInterval(errorTimeout)
        }
    }, [setIsLoaded])

    return (
        <Container>
            <FederationTermsIframe
                onLoad={() => {
                    setIsLoaded(true)
                }}
                src={tosUrl}
            />
            {isError ? (
                <ContentOverlay>
                    <Text variant="h2">{t('errors.failed-to-load-tos')}</Text>
                    <Text>
                        <ExternalTosLink
                            href={tosUrl}
                            target="_blank"
                            rel="noopener noreferrer">
                            {t('phrases.open-in-browser')}
                        </ExternalTosLink>
                    </Text>
                </ContentOverlay>
            ) : !isLoaded ? (
                <ContentOverlay>
                    <CircularLoader size="md" />
                </ContentOverlay>
            ) : null}
        </Container>
    )
}

const Container = styled('div', {
    borderRadius: 8,
    width: '100%',
    height: 480,
    border: `1px solid ${theme.colors.lightGrey}`,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
})

const FederationTermsIframe = styled('iframe', {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    border: 'none',
    overflow: 'auto',
})

const ContentOverlay = styled('div', {
    background: theme.colors.white,
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.md,
})

export const ExternalTosLink = styled('a', {
    fontSize: theme.fontSizes.body,
    fontWeight: theme.fontWeights.medium,
    wordBreak: 'break-word',
    textDecoration: 'underline',
})
