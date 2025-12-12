import React, { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import { usePopupFederationInfo } from '@fedi/common/hooks/federation'
import { RpcFederationPreview } from '@fedi/common/types/bindings'
import {
    getFederationTosUrl,
    getFederationWelcomeMessage,
    shouldShowJoinFederation,
} from '@fedi/common/utils/FederationUtils'

import { styled, theme } from '../../styles'
import { Button } from '../Button'
import { FederationAvatar } from '../FederationAvatar'
import FederationEndedPreview from '../FederationEndedPreview'
import * as Layout from '../Layout'
import { Switch } from '../Switch'
import { Text } from '../Text'

type Props = {
    federation: RpcFederationPreview
    onJoin: (recoverFromScratch: boolean) => void | Promise<void>
    onBack: () => void
    isJoining: boolean
}

const FederationPreview: React.FC<Props> = ({
    federation,
    onJoin,
    onBack,
    isJoining,
}) => {
    const { t } = useTranslation()

    const showJoinFederation = shouldShowJoinFederation(federation.meta)
    const [recoverFromScratch, setRecoverFromScratch] = useState(false)
    const [joinAnyways, setJoinAnyways] = useState(false)
    const tosUrl = getFederationTosUrl(federation.meta)
    const welcomeMessage = getFederationWelcomeMessage(federation.meta)
    const popupInfo = usePopupFederationInfo(federation.meta)
    const isReturningMember =
        federation.returningMemberStatus.type === 'returningMember'

    const handleJoin = () => {
        onJoin(recoverFromScratch)
    }

    let content: React.ReactNode
    let actions: React.ReactNode

    if (popupInfo?.ended) {
        content = (
            <Content>
                <FederationEndedPreview
                    popupInfo={popupInfo}
                    federation={federation}
                    setJoinAnyways={setJoinAnyways}
                />
            </Content>
        )

        actions = (
            <>
                <Button width="full" onClick={onBack}>
                    {t('phrases.go-back')}
                </Button>
                {joinAnyways && (
                    <Button width="full" onClick={handleJoin}>
                        {t('feature.federations.join-anyways')}
                    </Button>
                )}
            </>
        )
    } else {
        content = (
            <Content data-testid="federation-preview">
                <AvatarWrapper>
                    <FederationAvatar
                        federation={{
                            id: federation.id,
                            name: federation.name,
                            meta: federation.meta,
                        }}
                        size="lg"
                    />
                </AvatarWrapper>
                <Text
                    variant="h2"
                    weight="medium"
                    data-testid="federation-preview-name">
                    {federation.name}
                </Text>
                {welcomeMessage && (
                    <CustomWelcomeMessage data-testid="federation-preview-welcome-message">
                        <Trans components={{ bold: <strong /> }}>
                            {welcomeMessage}
                        </Trans>
                    </CustomWelcomeMessage>
                )}
            </Content>
        )

        actions = showJoinFederation ? (
            <>
                {isReturningMember && (
                    <RecoverFromScratch>
                        <RecoverFromScratchText>
                            <Text variant="small" weight="bold">
                                {t('feature.federations.recover-from-scratch')}
                            </Text>
                            <Text variant="small">
                                {t(
                                    'feature.federations.recover-from-scratch-warning',
                                )}
                            </Text>
                        </RecoverFromScratchText>
                        <Switch
                            checked={recoverFromScratch}
                            onCheckedChange={setRecoverFromScratch}
                        />
                    </RecoverFromScratch>
                )}
                {tosUrl ? (
                    <>
                        <ButtonWrapper>
                            <Button variant="tertiary" onClick={onBack}>
                                {t('feature.onboarding.i-do-not-accept')}
                            </Button>
                            <Button
                                width="full"
                                onClick={handleJoin}
                                loading={isJoining}>
                                {t('feature.onboarding.i-accept')}
                            </Button>
                        </ButtonWrapper>
                        <Text
                            variant="small"
                            css={{
                                color: theme.colors.grey,
                                textAlign: 'center',
                            }}>
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
                        </Text>
                    </>
                ) : (
                    <Button
                        width="full"
                        onClick={handleJoin}
                        loading={isJoining}>
                        {t('phrases.join-federation')}
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
                {t('feature.federations.new-members-disabled')}
            </Text>
        )
    }

    return (
        <Layout.Root>
            <Layout.Content fullWidth>{content}</Layout.Content>
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
    textAlign: 'center',
})

const CustomWelcomeMessage = styled('div', {
    background: theme.colors.offWhite100,
    padding: 16,
    borderRadius: 16,
    textAlign: 'left',
    fontSize: theme.fontSizes.caption,
    lineHeight: '20px',
})

const AvatarWrapper = styled('div', {})

const Link = styled('a', {
    color: theme.colors.link,
})

const ButtonWrapper = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
    width: '100%',
})

const RecoverFromScratch = styled('div', {
    alignItems: 'center',
    background: theme.colors.offWhite,
    borderRadius: 12,
    display: 'flex',
    gap: 10,
    padding: 12,
    textAlign: 'left',
})

const RecoverFromScratchText = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
})

export default FederationPreview
