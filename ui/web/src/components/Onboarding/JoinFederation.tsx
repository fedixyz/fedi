import { useRouter } from 'next/router'
import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { useFederationPreview } from '@fedi/common/hooks/federation'
import { makeLog } from '@fedi/common/utils/log'

import { federationsRoute, homeRoute } from '../../constants/routes'
import { styled } from '../../styles'
import { HoloLoader } from '../HoloLoader'
import * as Layout from '../Layout'
import { Redirect } from '../Redirect'
import CommunityPreview from './CommunityPreview'
import FederationPreview from './FederationPreview'

const log = makeLog('JoinFederation')

export const JoinFederation: React.FC = () => {
    const { t } = useTranslation()
    const { push, query } = useRouter()

    const inviteCode = String(query.id) || ''

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

    // If they came here with invite code in query string then paste the code for them
    useEffect(() => {
        if (!inviteCode) return
        // skip handling the code if we already have a preview
        if (federationPreview) return
        handleCode(inviteCode)
    }, [federationPreview, handleCode, inviteCode])

    let content: React.ReactNode

    if (isFetchingPreview) {
        return (
            <LoadingWrapper>
                <HoloLoader size={'xl'} />
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
                    handleJoin(() => push(federationsRoute), recoverFromScratch)
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
                    handleJoin(() => push(homeRoute))
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
                <Layout.Title subheader>{t('words.welcome')}</Layout.Title>
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
