import React, { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import { usePopupFederationInfo } from '@fedi/common/hooks/federation'
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
import { Switch } from './Switch'
import { Text } from './Text'

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    preview: RpcFederationPreview | undefined
    isJoining: boolean
    onJoin: (recoverFromScratch?: boolean) => void | Promise<void>
}

export const JoinFederationDialog: React.FC<Props> = ({
    open,
    onOpenChange,
    preview,
    isJoining,
    onJoin,
}) => {
    const { t } = useTranslation()
    const [recoverFromScratch, setRecoverFromScratch] = useState(false)
    const [joinAnyways, setJoinAnyways] = useState(false)

    const popupInfo = usePopupFederationInfo(preview?.meta ?? {})
    const showJoinFederation = preview
        ? shouldShowJoinFederation(preview.meta)
        : false
    const tosUrl = preview ? getFederationTosUrl(preview.meta) : null
    const welcomeMessage = preview
        ? getFederationWelcomeMessage(preview.meta)
        : null
    const isReturningMember =
        preview?.returningMemberStatus.type === 'returningMember'

    const handleClose = () => {
        onOpenChange(false)
    }

    const handleJoin = async () => {
        await onJoin(recoverFromScratch)
    }

    const renderLoading = () => (
        <LoadingContainer>
            <HoloLoader size="xl" />
        </LoadingContainer>
    )

    const renderEndedFederation = () => {
        if (!preview || !popupInfo) return null

        return (
            <>
                <FederationEndedPreview
                    popupInfo={popupInfo}
                    federation={preview}
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
                    {welcomeMessage && (
                        <WelcomeMessage>
                            <Trans components={{ bold: <strong /> }}>
                                {welcomeMessage}
                            </Trans>
                        </WelcomeMessage>
                    )}
                </Content>

                <Actions>
                    {showJoinFederation ? (
                        <>
                            {isReturningMember && (
                                <RecoverFromScratch>
                                    <RecoverFromScratchText>
                                        <Text variant="small" weight="bold">
                                            {t(
                                                'feature.federations.recover-from-scratch',
                                            )}
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
                                        disabled={isJoining}
                                    />
                                </RecoverFromScratch>
                            )}
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
                                        <Trans
                                            i18nKey="feature.onboarding.terms-url"
                                            components={{
                                                url: (
                                                    <Link
                                                        target="_blank"
                                                        href={tosUrl}>
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
            return renderEndedFederation()
        }

        return renderPreview()
    }

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            title={t('phrases.join-federation')}
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
    flex: 1,
    gap: 4,
})

const Link = styled('a', {
    color: theme.colors.link,
})
