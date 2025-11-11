import { useRouter } from 'next/router'
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import welcomeBackground from '@fedi/common/assets/images/welcome-bg.png'
import FediLogo from '@fedi/common/assets/svgs/fedi-logo-icon.svg'
import { useToast } from '@fedi/common/hooks/toast'
import { refreshOnboardingStatus } from '@fedi/common/redux'
import { makeLog } from '@fedi/common/utils/log'

import { Button } from '../components/Button'
import { ContentBlock } from '../components/ContentBlock'
import * as Layout from '../components/Layout'
import { Text } from '../components/Text'
import {
    ecashRoute,
    onboardingRoute,
    onboardingJoinRoute,
} from '../constants/routes'
import { useAppDispatch } from '../hooks'
import { fedimint } from '../lib/bridge'
import { styled, theme } from '../styles'
import { getHashParams } from '../utils/linking'

const log = makeLog('WelcomePage')

function WelcomePage() {
    const { t } = useTranslation()
    const { query, push } = useRouter()
    const dispatch = useAppDispatch()
    const toast = useToast()
    const [loading, setLoading] = useState<boolean>(false)

    const handleOnContinue = async () => {
        try {
            setLoading(true)
            await fedimint.completeOnboardingNewSeed()
            await dispatch(refreshOnboardingStatus(fedimint)).unwrap()

            if (query.invite_code) {
                push(onboardingJoinRoute(String(query.invite_code)))
                return
            }

            const params = getHashParams(window.location.hash)
            if (params?.id) {
                push(`${ecashRoute}#id=${params.id}`)
                return
            }

            push(onboardingRoute)
        } catch (err) {
            log.error('handleOnContinue', err)
            toast.error(t, err, 'errors.unknown-error')
        } finally {
            setLoading(false)
        }
    }

    return (
        <ContentBlock
            css={{
                backgroundImage: `url(${welcomeBackground.src})`,
                backgroundPosition: 'center center',
                backgroundSize: 'cover',
            }}>
            <Layout.Root>
                <Layout.Content centered fadeIn>
                    <ContentInner>
                        <FediLogo width={50} />
                        <Text variant="h2" weight="medium">
                            {t('feature.onboarding.fedi')}
                        </Text>
                        <Text variant="body">
                            {t('feature.onboarding.tagline')}
                        </Text>
                    </ContentInner>
                </Layout.Content>
                <Layout.Actions>
                    <Button
                        width="full"
                        onClick={handleOnContinue}
                        loading={loading}>
                        {t('feature.onboarding.get-a-wallet')}
                    </Button>
                    {!query?.invite_code && (
                        <Button
                            width="full"
                            href="/onboarding/recover"
                            variant="secondary">
                            {t('phrases.recover-my-account')}
                        </Button>
                    )}

                    <TextWrapper>
                        <Text
                            variant="caption"
                            css={{ color: theme.colors.darkGrey }}>
                            <Trans
                                i18nKey="feature.onboarding.agree-terms-privacy"
                                components={{
                                    termsLink: (
                                        <Link
                                            target="_blank"
                                            href={
                                                'https://www.fedi.xyz/terms-of-use'
                                            }
                                        />
                                    ),
                                    privacyLink: (
                                        <Link
                                            target="_blank"
                                            href={
                                                'https://www.fedi.xyz/privacy-policy'
                                            }
                                        />
                                    ),
                                }}
                            />
                        </Text>
                    </TextWrapper>
                </Layout.Actions>
            </Layout.Root>
        </ContentBlock>
    )
}

const ContentInner = styled('div', {
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    maxWidth: '80%',
    margin: '50px auto 0',
    textAlign: 'center',
    width: '100%',
})

const TextWrapper = styled('div', {
    paddingBottom: 10,
    paddingTop: 5,
    width: 260,
})

const Link = styled('a', {
    color: theme.colors.link,
})

export default WelcomePage
