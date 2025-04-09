import { styled } from '@stitches/react'
import Image from 'next/image'
import { useRouter } from 'next/router'
import { useTranslation } from 'react-i18next'

import AwesomeFedimint from '@fedi/common/assets/images/awesome-fedimint.png'
import { useLatestPublicFederations } from '@fedi/common/hooks/federation'
import { selectFederationIds } from '@fedi/common/redux'
import stringUtils from '@fedi/common/utils/StringUtils'

import { useAppSelector } from '../hooks'
import { theme } from '../styles'
import { Button } from './Button'
import { FederationAvatar } from './FederationAvatar'
import { Text } from './Text'

export default function PublicFederations() {
    const { t } = useTranslation()
    const joinedFederationIds = useAppSelector(selectFederationIds)
    const router = useRouter()
    const { publicFederations } = useLatestPublicFederations()

    return (
        <ContentContainer>
            <IllustrationWrapper>
                <Image src={AwesomeFedimint} alt="" width={200} height={200} />
            </IllustrationWrapper>
            <IntroTextWrapper>
                <Text variant="h2" weight="medium">
                    {t('feature.community.join-a-community')}
                </Text>
                <Text>{t('feature.community.join-community-guidance')}</Text>
            </IntroTextWrapper>
            {publicFederations.length > 0 && (
                <FederationContainer>
                    {publicFederations.map(f => (
                        <PublicFederationItem key={f.id}>
                            <PublicFederationAvatarWrapper>
                                <FederationAvatar federation={f} size="md" />
                            </PublicFederationAvatarWrapper>
                            <PublicFederationText>
                                <Text weight="bold">{f.name}</Text>
                                {f.meta.preview_message && (
                                    <Text
                                        variant="caption"
                                        weight="medium"
                                        css={{ color: theme.colors.grey }}>
                                        {stringUtils.truncateString(
                                            f.meta.preview_message,
                                            54,
                                        )}
                                    </Text>
                                )}
                            </PublicFederationText>
                            {f.meta?.invite_code && (
                                <PublicFederationButtonWrapper>
                                    <Button
                                        size="sm"
                                        width="full"
                                        onClick={() =>
                                            router.push(
                                                `/onboarding/join?code=${encodeURIComponent(String(f.meta.invite_code))}`,
                                            )
                                        }>
                                        {joinedFederationIds.includes(f.id)
                                            ? t('words.joined')
                                            : t('words.join')}
                                    </Button>
                                </PublicFederationButtonWrapper>
                            )}
                        </PublicFederationItem>
                    ))}
                </FederationContainer>
            )}
            <Button
                variant="tertiary"
                onClick={() => router.push('/onboarding/join')}>
                {t('phrases.join-another-federation')}
            </Button>
        </ContentContainer>
    )
}

const ContentContainer = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
})

const IntroTextWrapper = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    textAlign: 'center',
})

const FederationContainer = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
})

const PublicFederationItem = styled('div', {
    alignItems: 'center',
    background: theme.colors.offWhite,
    borderRadius: 10,
    boxSizing: 'border-box',
    display: 'flex',
    gap: 10,
    minHeight: 80,
    padding: 12,
})

const PublicFederationAvatarWrapper = styled('div', {
    alignItems: 'center',
    display: 'flex',
    width: 50,
})

const PublicFederationText = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    textAlign: 'left',
})

const PublicFederationButtonWrapper = styled('div', {
    alignItems: 'center',
    display: 'flex',
    width: 50,
})

const IllustrationWrapper = styled('div', {
    display: 'flex',
    justifyContent: 'center',
    padding: 16,
})
