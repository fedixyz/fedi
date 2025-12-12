import React from 'react'
import { Trans, useTranslation } from 'react-i18next'

import { type CommunityPreview } from '@fedi/common/types'
import {
    getFederationTosUrl,
    getFederationWelcomeMessage,
    shouldShowJoinFederation,
} from '@fedi/common/utils/FederationUtils'

import { styled, theme } from '../../styles'
import { Button } from '../Button'
import { FederationAvatar } from '../FederationAvatar'
import * as Layout from '../Layout'
import { Text } from '../Text'

type Props = {
    community: CommunityPreview
    onJoin: () => void | Promise<void>
    onBack: () => void
    isJoining: boolean
}

const CommunityPreview: React.FC<Props> = ({
    community,
    onJoin,
    onBack,
    isJoining,
}) => {
    const { t } = useTranslation()

    const showJoinFederation = shouldShowJoinFederation(community.meta)
    const tosUrl = getFederationTosUrl(community.meta)
    const welcomeMessage = getFederationWelcomeMessage(community.meta)

    const welcomeInstructions = t('feature.onboarding.welcome-instructions-new')

    const actions = showJoinFederation ? (
        <>
            {tosUrl ? (
                <>
                    <TermsUrl variant="small">
                        <Trans
                            i18nKey="feature.onboarding.terms-url"
                            components={{
                                url: (
                                    <Link target="_blank" href={tosUrl}>
                                        {tosUrl}
                                    </Link>
                                ),
                            }}
                        />
                    </TermsUrl>

                    <ButtonContainer>
                        <Button
                            width="full"
                            variant="tertiary"
                            onClick={onBack}>
                            {t('feature.onboarding.i-do-not-accept')}
                        </Button>
                        <Button
                            width="full"
                            onClick={onJoin}
                            loading={isJoining}>
                            {t('feature.onboarding.i-accept')}
                        </Button>
                    </ButtonContainer>
                </>
            ) : (
                <Button width="full" onClick={onJoin} loading={isJoining}>
                    {t('phrases.join-community')}
                </Button>
            )}
        </>
    ) : (
        <Text
            variant="small"
            css={{
                color: theme.colors.grey,
                textAlign: 'center',
            }}>
            {t('feature.communities.new-members-disabled')}
        </Text>
    )

    return (
        <Layout.Root>
            <Layout.Content fullWidth={!community}>
                <Content>
                    <AvatarWrapper>
                        <FederationAvatar
                            federation={{
                                id: community.id,
                                name: community.name,
                                meta: community.meta,
                            }}
                            size="lg"
                        />
                    </AvatarWrapper>
                    <Text variant="h2" weight="medium">
                        {community.name}
                    </Text>
                    <CustomWelcomeMessage>
                        {welcomeMessage ? (
                            <Trans components={{ bold: <strong /> }}>
                                {welcomeMessage}
                            </Trans>
                        ) : (
                            <Text variant="caption">{welcomeInstructions}</Text>
                        )}
                    </CustomWelcomeMessage>
                </Content>
            </Layout.Content>
            {actions && <Layout.Actions>{actions}</Layout.Actions>}
        </Layout.Root>
    )
}

const Content = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    gap: 8,
    background: '#FFF',
})

const ButtonContainer = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    width: '100%',
})

const CustomWelcomeMessage = styled('div', {
    background: theme.colors.offWhite100,
    padding: 16,
    borderRadius: 16,
    textAlign: 'center',
    fontSize: theme.fontSizes.caption,
    lineHeight: '20px',
})

const AvatarWrapper = styled('div', {
    marginBottom: 16,
})

const Link = styled('a', {
    color: theme.colors.link,
})

const TermsUrl = styled(Text, {
    color: theme.colors.grey,
    overflowWrap: 'break-word',
    textAlign: 'left',
    wordBreak: 'break-word',
    wordWrap: 'break-word',
})

export default CommunityPreview
