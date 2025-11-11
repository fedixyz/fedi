import { useRouter } from 'next/router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import alertIcon from '@fedi/common/assets/svgs/alert-warning-triangle.svg'
import cashIcon from '@fedi/common/assets/svgs/cash.svg'
import checkIcon from '@fedi/common/assets/svgs/check.svg'
import { useClaimEcash, useParseEcash } from '@fedi/common/hooks/pay'
import { useToast } from '@fedi/common/hooks/toast'
import amountUtils from '@fedi/common/utils/AmountUtils'

import { Button } from '../components/Button'
import { ContentBlock } from '../components/ContentBlock'
import { HoloLoader } from '../components/HoloLoader'
import { Icon } from '../components/Icon'
import * as Layout from '../components/Layout'
import { Text } from '../components/Text'
import { homeRoute, federationsRoute } from '../constants/routes'
import { fedimint } from '../lib/bridge'
import { styled } from '../styles'
import { getHashParams } from '../utils/linking'

function EcashPage() {
    const { t } = useTranslation()
    const { push } = useRouter()
    const toast = useToast()

    const {
        parseEcash,
        loading: validating,
        parsed: parsedEcash,
        ecashToken,
    } = useParseEcash(fedimint)

    const {
        claimEcash,
        loading: claiming,
        claimed: ecashClaimed,
        isError: isClaimError,
    } = useClaimEcash(fedimint)

    let content: React.ReactElement | null
    let actions: React.ReactElement | null

    // Get ecash token from hash on page load
    useEffect(() => {
        const hashParams = getHashParams(window.location.hash)
        if (!hashParams?.id) {
            push(homeRoute)
            return
        }

        parseEcash(hashParams.id)
    }, [push, parseEcash])

    useEffect(() => {
        if (isClaimError) {
            toast.error(t, 'feature.ecash.claim-ecash-error')
        }
    }, [isClaimError, t, toast])

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
                <Button
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

export default EcashPage
