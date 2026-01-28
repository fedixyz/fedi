import React, { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import { usePopupFederationInfo } from '@fedi/common/hooks/federation'
import { CommunityPreview } from '@fedi/common/types'
import { RpcFederationPreview } from '@fedi/common/types/bindings'
import {
    getFederationTosUrl,
    getFederationWelcomeMessage,
    shouldShowJoinFederation,
} from '@fedi/common/utils/FederationUtils'

import { styled, theme } from '../styles'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { FederationAvatar } from './FederationAvatar'
import FederationEndedPreview from './FederationEndedPreview'
import { HoloLoader } from './HoloLoader'
import { Text } from './Text'

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    preview: CommunityPreview | undefined
    isJoining: boolean
    onJoin: () => void | Promise<void>
}

export const JoinCommunityDialog: React.FC<Props> = ({
    open,
    onOpenChange,
    preview,
    isJoining,
    onJoin,
}) => {
    const { t } = useTranslation()
    const [joinAnyways, setJoinAnyways] = useState(false)

    const popupInfo = usePopupFederationInfo(preview?.meta ?? {})
    const canJoin = preview ? shouldShowJoinFederation(preview.meta) : false
    const tosUrl = preview ? getFederationTosUrl(preview.meta) : null
    const welcomeMessage = preview
        ? getFederationWelcomeMessage(preview.meta)
        : null

    const handleClose = () => {
        onOpenChange(false)
    }

    const handleJoin = async () => {
        await onJoin()
    }

    const renderLoading = () => (
        <LoadingContainer>
            <HoloLoader size="xl" />
        </LoadingContainer>
    )

    const renderEndedCommunity = () => {
        if (!preview || !popupInfo) return null

        return (
            <>
                <FederationEndedPreview
                    popupInfo={popupInfo}
                    federation={preview as unknown as RpcFederationPreview}
                    setJoinAnyways={setJoinAnyways}
                />
                <Actions>
                    <Button
                        width="full"
                        onClick={handleClose}
                        disabled={isJoining}>
                        {t('phrases.go-back')}
                    </Button>
                    {joinAnyways && (
                        <Button
                            width="full"
                            onClick={handleJoin}
                            loading={isJoining}>
                            {t('feature.federations.join-anyways')}
                        </Button>
                    )}
                </Actions>
            </>
        )
    }

    const renderPreview = () => {
        if (!preview) return null

        return (
            <>
                <Content>
                    <AvatarWrapper>
                        <FederationAvatar
                            federation={{
                                id: preview.id,
                                name: preview.name,
                                meta: preview.meta,
                            }}
                            size="lg"
                        />
                    </AvatarWrapper>
                    <Text variant="h2" weight="medium">
                        {preview.name}
                    </Text>
                    <WelcomeMessage>
                        <Trans components={{ bold: <strong /> }}>
                            {welcomeMessage ??
                                t(
                                    'feature.onboarding.welcome-instructions-new',
                                )}
                        </Trans>
                    </WelcomeMessage>
                </Content>

                <Actions>
                    {canJoin ? (
                        <>
                            {tosUrl ? (
                                <>
                                    <ButtonWrapper>
                                        <Button
                                            variant="tertiary"
                                            onClick={handleClose}
                                            disabled={isJoining}>
                                            {t(
                                                'feature.onboarding.i-do-not-accept',
                                            )}
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
                                        {t(
                                            'feature.onboarding.by-clicking-i-accept',
                                            {
                                                tos_url: '',
                                            },
                                        ).replace(' at {{tos_url}}', '')}
                                        {' at '}
                                        <Link target="_blank" href={tosUrl}>
                                            {tosUrl}
                                        </Link>
                                    </Text>
                                </>
                            ) : (
                                <Button
                                    width="full"
                                    onClick={handleJoin}
                                    loading={isJoining}>
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
                    )}
                </Actions>
            </>
        )
    }

    const renderContent = () => {
        if (!preview) {
            return renderLoading()
        }

        if (popupInfo?.ended) {
            return renderEndedCommunity()
        }

        return renderPreview()
    }

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            title={t('phrases.join-community')}
            type="tray"
            disableClose={isJoining}>
            {renderContent()}
        </Dialog>
    )
}

const LoadingContainer = styled('div', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
})

const Content = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    gap: 8,
    textAlign: 'center',
})

const AvatarWrapper = styled('div', {})

const WelcomeMessage = styled('div', {
    background: theme.colors.offWhite100,
    padding: 16,
    borderRadius: 16,
    textAlign: 'left',
    fontSize: theme.fontSizes.caption,
    lineHeight: '20px',
    width: '100%',
})

const Actions = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
    width: '100%',
})

const ButtonWrapper = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
    width: '100%',
})

const Link = styled('a', {
    color: theme.colors.link,
})
