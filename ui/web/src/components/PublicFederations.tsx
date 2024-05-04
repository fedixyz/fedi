import { styled } from '@stitches/react'
import Image from 'next/image'
import { useRouter } from 'next/router'
import { useTranslation } from 'react-i18next'

import AwesomeFedimint from '@fedi/common/assets/images/awesome-fedimint.png'
import { useLatestPublicFederations } from '@fedi/common/hooks/federation'
import { selectFederationIds } from '@fedi/common/redux'
import { ParserDataType } from '@fedi/common/types'

import { useRouteStateContext } from '../context/RouteStateContext'
import { useAppSelector } from '../hooks'
import { theme } from '../styles'
import { Button } from './Button'
import { FederationAvatar } from './FederationAvatar'
import { Text } from './Text'

export default function PublicFederations() {
    const { t } = useTranslation()
    const joinedFederationIds = useAppSelector(selectFederationIds)
    const router = useRouter()
    const { pushWithState } = useRouteStateContext()
    const { publicFederations } = useLatestPublicFederations()

    return (
        <ContentContainer>
            <IllustrationWrapper>
                <Image src={AwesomeFedimint} alt="" width={200} height={200} />
            </IllustrationWrapper>
            <Text
                variant="h2"
                weight="medium"
                css={{
                    textAlign: 'center',
                }}>
                {t('feature.onboarding.guidance-public-federations')}
            </Text>
            {publicFederations.length > 0 && (
                <FederationContainer>
                    {publicFederations.map(f => (
                        <PublicFederationItem key={f.id}>
                            <FederationAvatar federation={f} size="md" />
                            <PublicFederationText>
                                <Text weight="bold">{f.name}</Text>
                                <Text
                                    variant="caption"
                                    weight="medium"
                                    css={{ color: theme.colors.grey }}>
                                    {f.meta.preview_message}
                                </Text>
                            </PublicFederationText>
                            <Button
                                size="sm"
                                onClick={() =>
                                    // TODO: fix public federation type.
                                    // probably should use/extend Federation
                                    f.meta.invite_code &&
                                    pushWithState('/onboarding/join', {
                                        type: ParserDataType.FedimintInvite,
                                        data: {
                                            invite: f.meta.invite_code,
                                        },
                                    })
                                }>
                                {joinedFederationIds.includes(f.id)
                                    ? t('words.joined')
                                    : t('words.join')}
                            </Button>
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

const PublicFederationItem = styled('div', {
    display: 'flex',
    gap: 12,
    background: theme.colors.offWhite,
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
})

const PublicFederationText = styled('div', {
    display: 'flex',
    gap: 4,
    flexDirection: 'column',
    flexGrow: 1,
})

const FederationContainer = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
})

const IllustrationWrapper = styled('div', {
    display: 'flex',
    justifyContent: 'center',
    padding: 16,
})
