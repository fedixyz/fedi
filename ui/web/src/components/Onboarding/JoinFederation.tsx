import { useRouter } from 'next/router'
import React, { useCallback, useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import { usePopupFederationInfo } from '@fedi/common/hooks/federation'
import { useToast } from '@fedi/common/hooks/toast'
import {
    joinFederation,
    selectFederationIds,
    selectHasSetMatrixDisplayName,
    setActiveFederationId,
} from '@fedi/common/redux'
import { JoinPreview, ParserDataType } from '@fedi/common/types'
import {
    getFederationTosUrl,
    getFederationWelcomeMessage,
    getIsFederationSupported,
    previewInvite,
} from '@fedi/common/utils/FederationUtils'
import { makeLog } from '@fedi/common/utils/log'

import { useRouteState } from '../../context/RouteStateContext'
import { useAppDispatch, useAppSelector, useMediaQuery } from '../../hooks'
import { fedimint } from '../../lib/bridge'
import { config, styled, theme } from '../../styles'
import { Button } from '../Button'
import { FederationAvatar } from '../FederationAvatar'
import FederationEndedPreview from '../FederationEndedPreview'
import { Header, Title } from '../Layout'
import { OmniInput } from '../OmniInput'
import { Text } from '../Text'
import { TermsOfService } from './TermsOfService'
import {
    OnboardingActions,
    OnboardingContainer,
    OnboardingContent,
} from './components'

const log = makeLog('JoinFederation')

export const JoinFederation: React.FC = () => {
    const dispatch = useAppDispatch()
    const routeState = useRouteState('/onboarding/join')
    const invite = routeState?.data.invite
    const { t } = useTranslation()
    const { push } = useRouter()
    const toast = useToast()
    const [isFetchingPreview, setIsFetchingPreview] = useState(false)
    const [isJoining, setIsJoining] = useState(false)
    const [isShowingTos, setIsShowingTos] = useState(false)
    const [federationPreview, setFederationPreview] = useState<JoinPreview>()
    const federationIds = useAppSelector(selectFederationIds)
    const isSm = useMediaQuery(config.media.sm)
    const popupInfo = usePopupFederationInfo(federationPreview?.meta)
    const hasSetDisplayName = useAppSelector(selectHasSetMatrixDisplayName)

    const handleCode = useCallback(
        async (code: string) => {
            setIsFetchingPreview(true)
            try {
                const fed = await previewInvite(fedimint, code)
                if (federationIds.includes(fed.id)) {
                    dispatch(setActiveFederationId(fed.id))
                    push('/')
                    toast.show(t('errors.you-have-already-joined'))
                } else {
                    setFederationPreview(fed)
                }
            } catch (err) {
                log.error('handleCode', err)
                toast.error(t, err, 'errors.invalid-federation-code')
            }
            setIsFetchingPreview(false)
        },
        [federationIds, dispatch, push, t, toast],
    )

    // If they came here with route state, paste the code for them
    useEffect(() => {
        if (!invite) return
        handleCode(invite)
    }, [invite, handleCode])

    const handleJoin = useCallback(async () => {
        setIsJoining(true)
        try {
            if (!federationPreview) throw new Error()
            await dispatch(
                joinFederation({
                    fedimint,
                    code: federationPreview.inviteCode,
                }),
            ).unwrap()
            push(
                hasSetDisplayName
                    ? '/onboarding/complete'
                    : '/onboarding/username',
            )
        } catch (err) {
            log.error('handleJoin', err)
            toast.error(t, err, 'errors.invalid-federation-code')
            setIsJoining(false)
        }
    }, [dispatch, federationPreview, hasSetDisplayName, push, t, toast])

    const tosUrl = federationPreview
        ? getFederationTosUrl(federationPreview.meta)
        : null

    let content: React.ReactNode
    let actions: React.ReactNode
    if (!federationPreview) {
        content = (
            <ScanWrap>
                <Text variant="h2" weight="medium">
                    {t('feature.federations.scan-federation-invite')}
                </Text>
                <OmniInput
                    expectedInputTypes={[ParserDataType.FedimintInvite]}
                    onExpectedInput={({ data }) => {
                        if (isJoining) return
                        handleCode(data.invite)
                    }}
                    onUnexpectedSuccess={() => null}
                    inputLabel={t('feature.federations.enter-federation-code')}
                    inputPlaceholder="fed1..."
                    pasteLabel={t('feature.federations.paste-federation-code')}
                    loading={isFetchingPreview}
                    defaultToScan
                />
            </ScanWrap>
        )
    } else if (!getIsFederationSupported(federationPreview)) {
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
    } else if (tosUrl && isShowingTos) {
        return <TermsOfService tosUrl={tosUrl} onAccept={handleJoin} />
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

        const welcomeTitle =
            memberStatus === 'returningMember'
                ? t('feature.onboarding.welcome-back-to-federation', {
                      federation: federationPreview.name,
                  })
                : t('feature.onboarding.welcome-to-federation', {
                      federation: federationPreview.name,
                  })
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
                        {welcomeTitle}
                    </Text>
                    {welcomeMessage ? (
                        <CustomWelcomeMessage>
                            <Trans components={{ bold: <strong /> }}>
                                {welcomeMessage}
                            </Trans>
                        </CustomWelcomeMessage>
                    ) : (
                        <Text variant="caption">{welcomeInstructions}</Text>
                    )}
                </FederationPreviewInner>
            </FederationPreviewOuter>
        )

        actions = (
            <>
                <Button
                    width="full"
                    onClick={() => {
                        if (tosUrl) {
                            setIsShowingTos(true)
                        } else {
                            handleJoin()
                        }
                    }}
                    loading={isJoining}>
                    {t('words.continue')}
                </Button>
            </>
        )
    }

    return (
        <OnboardingContainer>
            {isSm && (
                <Header back="/onboarding/welcome">
                    <Title subheader>
                        {t('feature.federations.join-federation')}
                    </Title>
                </Header>
            )}
            <OnboardingContent fullWidth={!federationPreview}>
                {content}
            </OnboardingContent>
            {actions && <OnboardingActions>{actions}</OnboardingActions>}
        </OnboardingContainer>
    )
}

const ScanWrap = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    gap: 16,
})

const previewRadius = 20
const previewPadding = 2
const FederationPreviewOuter = styled('div', {
    padding: previewPadding,
    borderRadius: previewRadius,
    holoGradient: '900',
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
    holoGradient: '400',
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
