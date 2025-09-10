import { useRouter } from 'next/router'
import React, { useCallback, useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import { usePopupFederationInfo } from '@fedi/common/hooks/federation'
import { useToast } from '@fedi/common/hooks/toast'
import {
    joinFederation,
    selectFederationIds,
    setActiveFederationId,
} from '@fedi/common/redux'
import { JoinPreview } from '@fedi/common/types'
import {
    getFederationTosUrl,
    getFederationWelcomeMessage,
    getIsFederationSupported,
    previewInvite,
} from '@fedi/common/utils/FederationUtils'
import { makeLog } from '@fedi/common/utils/log'

import { useAppDispatch, useAppSelector, useMediaQuery } from '../../hooks'
import { fedimint } from '../../lib/bridge'
import { config, styled, theme } from '../../styles'
import { Button } from '../Button'
import { FederationAvatar } from '../FederationAvatar'
import FederationEndedPreview from '../FederationEndedPreview'
import { HoloLoader } from '../HoloLoader'
import { Header, Title } from '../Layout'
import { Redirect } from '../Redirect'
import { Switch } from '../Switch'
import { Text } from '../Text'
import {
    OnboardingActions,
    OnboardingContainer,
    OnboardingContent,
} from './components'

const log = makeLog('JoinFederation')

export const JoinFederation: React.FC = () => {
    const dispatch = useAppDispatch()

    const { t } = useTranslation()
    const { back, push, query } = useRouter()
    const toast = useToast()

    const federationIds = useAppSelector(selectFederationIds)
    const isSm = useMediaQuery(config.media.sm)

    const [isJoining, setIsJoining] = useState(false)
    const [isFetchingPreview, setIsFetchingPreview] = useState<boolean>(true)
    const [federationPreview, setFederationPreview] = useState<JoinPreview>()
    const [recoverFromScratch, setRecoverFromScratch] = useState(false)

    const popupInfo = usePopupFederationInfo(federationPreview?.meta)

    const handleCode = useCallback(async (invite_code: string) => {
        try {
            setIsFetchingPreview(true)
            const fed = await previewInvite(fedimint, invite_code)
            setFederationPreview(fed)
        } catch (err) {
            log.error('handleCode', err)
        } finally {
            setIsFetchingPreview(false)
        }
    }, [])

    const handleJoin = useCallback(async () => {
        setIsJoining(true)
        try {
            if (!federationPreview) throw new Error()

            if (federationIds.includes(federationPreview.id)) {
                dispatch(setActiveFederationId(federationPreview.id))
                push('/home')
                return
            }

            await dispatch(
                joinFederation({
                    fedimint,
                    code: federationPreview.inviteCode,
                    recoverFromScratch,
                }),
            ).unwrap()

            push('/home')
        } catch (err) {
            log.error('handleJoin', err)
            toast.error(t, err, 'errors.invalid-federation-code')
            setIsJoining(false)
        }
    }, [
        dispatch,
        federationIds,
        federationPreview,
        push,
        recoverFromScratch,
        t,
        toast,
    ])

    // If they came here with invite code in query string then paste the code for them
    useEffect(() => {
        if (query.invite_code && !federationPreview) {
            const invite_code = String(query.invite_code)
            handleCode(invite_code)
        }
    }, [query.invite_code, federationPreview, handleCode])

    const tosUrl = federationPreview
        ? getFederationTosUrl(federationPreview.meta)
        : null

    let content: React.ReactNode
    let actions: React.ReactNode

    if (isFetchingPreview) {
        return (
            <OnboardingContainer>
                <OnboardingContent fullWidth={true}>
                    <HoloLoader size={'xl'} />
                </OnboardingContent>
            </OnboardingContainer>
        )
    }

    if (!federationPreview) {
        return <Redirect path="/onboarding" />
    }

    if (!getIsFederationSupported(federationPreview)) {
        content = (
            <FederationPreviewOuter>
                <FederationPreviewInner>
                    <AvatarWrapper>
                        <FederationAvatar
                            federation={{
                                id: federationPreview.id,
                                name: federationPreview.name,
                                meta: federationPreview.meta,
                            }}
                            size="lg"
                        />
                    </AvatarWrapper>
                    <Text variant="h2" weight="medium">
                        {federationPreview.name}
                    </Text>
                    <UnsupportedBadge>
                        <Text variant="caption" weight="medium">
                            {t('words.unsupported')}
                        </Text>
                    </UnsupportedBadge>
                    <Text variant="caption">
                        {t('feature.onboarding.unsupported-notice')}
                    </Text>
                </FederationPreviewInner>
            </FederationPreviewOuter>
        )

        actions = (
            <>
                <Button
                    width="full"
                    onClick={() => {
                        setIsJoining(false)
                        setFederationPreview(undefined)
                    }}>
                    {t('words.okay')}
                </Button>
            </>
        )
    } else if (popupInfo?.ended) {
        content = (
            <FederationPreviewOuter>
                <FederationPreviewInner>
                    <FederationEndedPreview
                        popupInfo={popupInfo}
                        federation={federationPreview}
                    />
                </FederationPreviewInner>
            </FederationPreviewOuter>
        )

        actions = (
            <>
                <Button
                    width="full"
                    onClick={() => {
                        setIsJoining(false)
                        setFederationPreview(undefined)
                    }}>
                    {t('phrases.go-back')}
                </Button>
            </>
        )
    } else {
        const welcomeMessage = getFederationWelcomeMessage(
            federationPreview.meta,
        )
        const memberStatus = federationPreview.hasWallet
            ? federationPreview.returningMemberStatus.type
            : undefined

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
                                id: federationPreview.id,
                                name: federationPreview.name,
                                meta: federationPreview.meta,
                            }}
                            size="lg"
                        />
                    </AvatarWrapper>
                    <Text variant="h2" weight="medium">
                        {federationPreview.name}
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

        actions = (
            <>
                {memberStatus === 'returningMember' && (
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

                        <div>
                            <Button variant="tertiary" onClick={() => back()}>
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
                        {federationPreview.hasWallet
                            ? t('phrases.join-federation')
                            : t('phrases.join-community')}
                    </Button>
                )}
            </>
        )
    }

    return (
        <OnboardingContainer>
            {isSm && (
                <Header back>
                    <Title subheader>{t('words.welcome')}</Title>
                </Header>
            )}
            <OnboardingContent fullWidth={!federationPreview}>
                {content}
            </OnboardingContent>
            {actions && <OnboardingActions>{actions}</OnboardingActions>}
        </OnboardingContainer>
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

const UnsupportedBadge = styled('div', {
    background: theme.colors.red,
    color: theme.colors.white,
    borderRadius: 16,
    padding: `${theme.space.xs} ${theme.space.sm}`,
})

const TermsUrl = styled(Text, {
    color: theme.colors.grey,
    overflowWrap: 'break-word',
    textAlign: 'left',
    wordBreak: 'break-word',
    wordWrap: 'break-word',
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
