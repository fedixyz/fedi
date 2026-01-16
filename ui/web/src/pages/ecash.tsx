import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import alertIcon from '@fedi/common/assets/svgs/alert-warning-triangle.svg'
import cashIcon from '@fedi/common/assets/svgs/cash.svg'
import checkIcon from '@fedi/common/assets/svgs/check.svg'
import { useClaimEcash, useParseEcash } from '@fedi/common/hooks/pay'
import { useToast } from '@fedi/common/hooks/toast'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { getFederationTosUrl } from '@fedi/common/utils/FederationUtils'

import { Button } from '../components/Button'
import { ContentBlock } from '../components/ContentBlock'
import { FederationAvatar } from '../components/FederationAvatar'
import { Column, Row } from '../components/Flex'
import { HoloLoader } from '../components/HoloLoader'
import { Icon } from '../components/Icon'
import * as Layout from '../components/Layout'
import { Text } from '../components/Text'
import { homeRoute, federationsRoute } from '../constants/routes'
import { styled, theme } from '../styles'
import { getHashParams } from '../utils/linking'

function EcashPage() {
    const { t } = useTranslation()
    const { push } = useRouter()
    const toast = useToast()

    const [tosUrl, setTosUrl] = useState<string | null>('')

    const {
        parseEcash,
        loading: validating,
        parsed: parsedEcash,
        ecashToken,
        federation,
    } = useParseEcash()

    const {
        claimEcash,
        loading: claiming,
        claimed: ecashClaimed,
        isError: isClaimError,
    } = useClaimEcash()

    let content: React.ReactElement | null
    let actions: React.ReactElement | null

    // Get ecash token from hash on page load
    useEffect(() => {
        const hashParams = getHashParams(window.location.hash)

        parseEcash(hashParams.id)
    }, [push, parseEcash])

    useEffect(() => {
        if (isClaimError) {
            toast.error(t, 'feature.ecash.claim-ecash-error')
        }
    }, [isClaimError, t, toast])

    useEffect(() => {
        if (!federation?.meta) return

        setTosUrl(getFederationTosUrl(federation.meta))
    }, [federation])

    if (validating) {
        content = (
            <LoadingWrapper>
                <HoloLoader size={'xl'} />
            </LoadingWrapper>
        )
        actions = null
    } else if (!parsedEcash) {
        content = (
            <Content>
                <Icon icon={alertIcon} size="lg" />
                <Text variant="h2" weight="medium">
                    {t('feature.ecash.invalid-ecash-token')}
                </Text>
                <Text variant="body">
                    {t('feature.ecash.invalid-ecash-token-description')}
                </Text>
            </Content>
        )
        actions = (
            <Button width="full" variant="tertiary" href={homeRoute}>
                {t('words.cancel')}
            </Button>
        )
    } else if (ecashClaimed) {
        content = (
            <Content>
                <Icon icon={checkIcon} size="lg" />
                <Text variant="h2" weight="medium">
                    {t('feature.ecash.ecash-claimed')}
                </Text>
                <Text variant="body">
                    {t('feature.ecash.claim-ecash-success-description')}
                </Text>
            </Content>
        )

        actions = (
            <>
                <Button width="full" href={federationsRoute}>
                    {t('feature.ecash.go-to-wallet')}
                </Button>
                <Button width="full" variant="tertiary" href={homeRoute}>
                    {t('phrases.maybe-later')}
                </Button>
            </>
        )
    } else {
        content = (
            <Content>
                <Icon icon={cashIcon} size="lg" />
                <Text variant="h2" weight="medium">
                    {amountUtils.msatToSatString(parsedEcash.amount)} SATS
                </Text>
                <Text variant="body">
                    {t('feature.ecash.claim-ecash-description')}
                </Text>
            </Content>
        )

        actions = (
            <>
                {federation && (
                    <Info gap="md">
                        <FederationWrapper>
                            <AvatarWrapper>
                                <FederationAvatar
                                    federation={federation}
                                    size="sm"
                                />
                            </AvatarWrapper>
                            <TextWrapper justify="center">
                                {parsedEcash?.federation_type ===
                                'notJoined' ? (
                                    <Text
                                        variant="small"
                                        css={{ color: theme.colors.darkGrey }}>
                                        {t(
                                            'feature.ecash.adding-to-new-wallet',
                                            {
                                                federation_name:
                                                    federation.name,
                                            },
                                        )}
                                    </Text>
                                ) : (
                                    <Text
                                        variant="small"
                                        css={{ color: theme.colors.darkGrey }}>
                                        {t(
                                            'feature.ecash.adding-to-existing-wallet',
                                            {
                                                federation_name:
                                                    federation.name,
                                            },
                                        )}
                                    </Text>
                                )}
                            </TextWrapper>
                        </FederationWrapper>
                        {tosUrl && (
                            <Text
                                variant="small"
                                css={{
                                    color: theme.colors.grey,
                                    textAlign: 'left',
                                }}>
                                <Trans
                                    i18nKey="feature.ecash.terms-link-web"
                                    components={{
                                        url: (
                                            <Link target="_blank" href={tosUrl}>
                                                {tosUrl}
                                            </Link>
                                        ),
                                    }}
                                />
                            </Text>
                        )}
                    </Info>
                )}
                <Button
                    aria-label={t('feature.ecash.claim-ecash')}
                    width="full"
                    onClick={() => claimEcash(parsedEcash, ecashToken)}
                    disabled={claiming}
                    loading={claiming}>
                    {t('feature.ecash.claim-ecash')}
                </Button>
                <Button
                    width="full"
                    variant="tertiary"
                    onClick={() => push(homeRoute)}>
                    {t('phrases.maybe-later')}
                </Button>
            </>
        )
    }

    return (
        <ContentBlock>
            <Layout.Root>
                <Layout.Header centered>
                    <Layout.Title subheader>Claim Ecash</Layout.Title>
                </Layout.Header>
                <Layout.Content centered>{content}</Layout.Content>
                <Layout.Actions>{actions}</Layout.Actions>
            </Layout.Root>
        </ContentBlock>
    )
}

const Content = styled('div', {
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 20,
    textAlign: 'center',
})

const LoadingWrapper = styled('div', {
    alignItems: 'center',
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
})

const Info = styled(Column, {
    width: '100%',
})

const FederationWrapper = styled(Row, {
    background: theme.colors.offWhite100,
    borderRadius: 8,
    gap: 8,
    padding: theme.spacing.sm,
    width: '100%',
})

const AvatarWrapper = styled('div', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
})

const TextWrapper = styled(Column, {
    flex: 1,
    textAlign: 'left',
})

const Link = styled('a', {
    color: theme.colors.link,
})

export default EcashPage
