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
            <FederationPreviewOuter>
                <FederationPreviewInner>
                    <FederationEndedPreview
                        popupInfo={popupInfo}
                        federation={federation}
                    />
                </FederationPreviewInner>
            </FederationPreviewOuter>
        )

        actions = (
            <>
                <Button width="full" onClick={onBack}>
                    {t('phrases.go-back')}
                </Button>
            </>
        )
    } else {
        const memberStatus = federation.returningMemberStatus.type
        const welcomeInstructions =
            memberStatus === 'newMember'
                ? t('feature.onboarding.welcome-instructions-new')
                : memberStatus === 'returningMember'
                  ? t('feature.onboarding.welcome-instructions-returning')
                  : t('feature.onboarding.welcome-instructions-unknown')
        content = (
            <FederationPreviewOuter>
                <FederationPreviewInner>
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
                    <Text variant="h2" weight="medium">
                        {federation.name}
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
                </FederationPreviewInner>
            </FederationPreviewOuter>
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

                        <div>
                            <Button variant="tertiary" onClick={onBack}>
                                {t('feature.onboarding.i-do-not-accept')}
                            </Button>
                            <Button
                                width="full"
                                onClick={handleJoin}
                                loading={isJoining}>
                                {t('feature.onboarding.i-accept')}
                            </Button>
                        </div>
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
        ) : null
    }

    return (
        <Layout.Root>
            <Layout.Content fullWidth={!federation}>{content}</Layout.Content>
            {actions && <Layout.Actions>{actions}</Layout.Actions>}
        </Layout.Root>
    )
}

const previewRadius = 20
const previewPadding = 2

const FederationPreviewOuter = styled('div', {
    padding: previewPadding,
})

const FederationPreviewInner = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    gap: 8,
    padding: 24,
    background: '#FFF',
    borderRadius: previewRadius - previewPadding,
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
