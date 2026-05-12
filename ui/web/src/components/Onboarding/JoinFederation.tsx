import { useRouter } from 'next/router'
import React, { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { useFederationPreview } from '@fedi/common/hooks/federation'
import { setCurrentUrl } from '@fedi/common/redux/browser'
import { detectInviteCodeType } from '@fedi/common/utils/FederationUtils'
import { makeLog } from '@fedi/common/utils/log'

import { ecashRoute, homeRoute, walletRoute } from '../../constants/routes'
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
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const { push, query } = useRouter()

    const hashParams =
        typeof window === 'undefined' ? {} : getHashParams(window.location.hash)
    const inviteCode =
        typeof query.id === 'string' ? query.id : hashParams.id || ''
    const afterJoinEcash = hashParams.afterJoinEcash
    const afterJoinUrl = hashParams.afterJoinUrl

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

    const goToNextScreen = useCallback(() => {
        if (afterJoinEcash) {
            push(`${ecashRoute}#id=${encodeURIComponent(afterJoinEcash)}`)
            return
        }

        if (afterJoinUrl) {
            dispatch(setCurrentUrl({ url: afterJoinUrl }))
            push(federationPreview ? walletRoute : homeRoute)
            return
        }

        push(federationPreview ? walletRoute : homeRoute)
    }, [afterJoinEcash, afterJoinUrl, dispatch, federationPreview, push])

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

    if (isFetchingPreview) {
        return (
            <LoadingWrapper>
                <HoloLoader size={'lg'} />
            </LoadingWrapper>
        )
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
        return <Redirect path="/onboarding" />
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
