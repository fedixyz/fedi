import { useRouter } from 'next/router'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useFederationPreview } from '@fedi/common/hooks/federation'
import { setCurrentUrl } from '@fedi/common/redux/browser'
import type { InviteCodeType } from '@fedi/common/types'
import { detectInviteCodeType } from '@fedi/common/utils/FederationUtils'
import { makeLog } from '@fedi/common/utils/log'

import {
    ecashRoute,
    homeRoute,
    onboardingRoute,
    walletRoute,
} from '../../constants/routes'
import { useAppDispatch } from '../../hooks'
import { styled } from '../../styles'
import { getHashParams } from '../../utils/linking'
import { HoloLoader } from '../HoloLoader'
import * as Layout from '../Layout'
import { Redirect } from '../Redirect'
import CommunityPreview from './CommunityPreview'
import FederationPreview from './FederationPreview'

const log = makeLog('JoinFederation')

export const JoinFederation: React.FC = () => {
    const { query } = useRouter()
    // Remount on a chained join (?id=) so the second join gets a fresh preview
    // and a reset redirect state, not the first join's stale ones.
    return (
        <JoinFederationScreen
            key={typeof query.id === 'string' ? query.id : 'join'}
        />
    )
}

const JoinFederationScreen: React.FC = () => {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const { push, query } = useRouter()
    const [isRedirecting, setIsRedirecting] = useState(false)

    const hashParams =
        typeof window === 'undefined' ? {} : getHashParams(window.location.hash)
    const inviteCode =
        typeof query.id === 'string' ? query.id : hashParams.id || ''
    const afterJoinEcash = hashParams.afterJoinEcash
    const afterJoinUrl = hashParams.afterJoinUrl
    const afterJoinFederation = hashParams.afterJoinFederation

    const {
        isJoining,
        setIsJoining,
        isFetchingPreview,
        federationPreview,
        setFederationPreview,
        communityPreview,
        setCommunityPreview,
        handleCode,
        handleJoin,
    } = useFederationPreview(t, inviteCode)

    const goToNextScreen = useCallback(
        (codeType?: InviteCodeType) => {
            const isFederation = codeType === 'federation' || federationPreview
            const nextRoute = isFederation ? walletRoute : homeRoute

            setIsRedirecting(true)

            if (afterJoinEcash) {
                push(`${ecashRoute}#id=${encodeURIComponent(afterJoinEcash)}`)
                return
            }

            if (afterJoinUrl) {
                dispatch(setCurrentUrl({ url: afterJoinUrl }))
                push(nextRoute)
                return
            }

            if (afterJoinFederation) {
                // The ?id= change flips the remount key above, so the second
                // join mounts fresh with its own preview.
                push(
                    `${onboardingRoute}/join?id=${encodeURIComponent(
                        afterJoinFederation,
                    )}`,
                )
                return
            }

            push(nextRoute)
        },
        [
            afterJoinEcash,
            afterJoinUrl,
            afterJoinFederation,
            dispatch,
            federationPreview,
            push,
        ],
    )

    // If they came here with invite code in query string then paste the code for them
    useEffect(() => {
        if (!inviteCode || federationPreview || communityPreview) return
        // skip handling the code if we already have a preview
        handleCode(inviteCode, goToNextScreen)
    }, [
        federationPreview,
        communityPreview,
        handleCode,
        inviteCode,
        goToNextScreen,
    ])

    let content: React.ReactNode

    if (isFetchingPreview || isRedirecting) {
        return (
            <LoadingWrapper>
                <HoloLoader size={'lg'} />
            </LoadingWrapper>
        )
    }

    if (!inviteCode) {
        return <Redirect path={onboardingRoute} />
    }

    if (federationPreview) {
        content = (
            <FederationPreview
                isJoining={isJoining}
                onJoin={(recoverFromScratch: boolean) => {
                    if (recoverFromScratch) {
                        log.info(
                            `Recovering from scratch. (federation id: ${federationPreview.id})`,
                        )
                    }
                    handleJoin(goToNextScreen, recoverFromScratch)
                }}
                onBack={() => {
                    setIsJoining(false)
                    setFederationPreview(undefined)
                }}
                federation={federationPreview}
            />
        )
    }

    if (communityPreview) {
        content = (
            <CommunityPreview
                isJoining={isJoining}
                onJoin={() => {
                    handleJoin(goToNextScreen)
                }}
                onBack={() => {
                    setIsJoining(false)
                    setCommunityPreview(undefined)
                }}
                community={communityPreview}
            />
        )
    }

    if (!federationPreview && !communityPreview) {
        return <Redirect path={onboardingRoute} />
    }

    return (
        <Layout.Root>
            <Layout.Header back>
                <Layout.Title subheader>
                    {t(
                        inviteCode &&
                            detectInviteCodeType(inviteCode) === 'community'
                            ? 'phrases.space-invitation'
                            : 'phrases.wallet-service',
                    )}
                </Layout.Title>
            </Layout.Header>
            <Layout.Content>{content}</Layout.Content>
        </Layout.Root>
    )
}

const LoadingWrapper = styled('div', {
    alignItems: 'center',
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
})
