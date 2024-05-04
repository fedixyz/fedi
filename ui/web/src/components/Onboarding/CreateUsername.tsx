import { useRouter } from 'next/router'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useIsChatSupported } from '@fedi/common/hooks/federation'
import { useToast } from '@fedi/common/hooks/toast'
import { authenticateChat, selectActiveFederationId } from '@fedi/common/redux'
import { makeLog } from '@fedi/common/utils/log'

import { useAppDispatch, useAppSelector } from '../../hooks'
import { fedimint } from '../../lib/bridge'
import { styled } from '../../styles'
import { Button } from '../Button'
import { HoloLoader } from '../HoloLoader'
import { Input } from '../Input'
import { Redirect } from '../Redirect'
import { Text } from '../Text'
import {
    OnboardingActions,
    OnboardingContainer,
    OnboardingContent,
} from './components'

const log = makeLog('CreateUsername')

export const CreateUsername: React.FC = () => {
    const dispatch = useAppDispatch()
    const { t } = useTranslation()
    const { push } = useRouter()
    const toast = useToast()
    const [isRecoveringUsername, setIsRecoveringUsername] = useState(true)
    const [username, setUsername] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const federationId = useAppSelector(selectActiveFederationId)
    const isChatSupported = useIsChatSupported()

    // Attempt to fetch username from the bridge in case they were previously
    // a member.
    useEffect(() => {
        async function fetchCreds() {
            if (!federationId) return
            const creds = await fedimint.getXmppCredentials(federationId)
            if (!creds.username) {
                setIsRecoveringUsername(false)
                return
            }
            try {
                setUsername(creds.username)
                await dispatch(
                    authenticateChat({
                        fedimint,
                        federationId,
                        username: creds.username.toLowerCase(),
                    }),
                ).unwrap()
                push('/onboarding/complete')
            } catch (err) {
                log.error('failed to fetch xmpp credentials', err)
                toast.error(t, err, 'errors.unknown-error')
                setIsRecoveringUsername(false)
            }
        }
        fetchCreds()
    }, [federationId, dispatch, t, toast, push])

    if (!federationId) {
        return <Redirect path="/onboarding" />
    }
    if (!isChatSupported) {
        return <Redirect path="/onboarding/welcome" />
    }

    const handleSubmit = async (ev: React.FormEvent) => {
        ev.preventDefault()
        setIsSubmitting(true)
        try {
            await dispatch(
                authenticateChat({ fedimint, federationId, username }),
            ).unwrap()
            push('/onboarding/complete')
        } catch (err) {
            log.error('handleSubmit', err)
            toast.error(t, err, 'errors.unknown-error')
        }
        setIsSubmitting(false)
    }

    let content: React.ReactNode
    if (isRecoveringUsername) {
        content = (
            <OnboardingContent>
                <HoloLoader size="xl" />
            </OnboardingContent>
        )
    } else {
        content = (
            <>
                <OnboardingContent>
                    <Text variant="h2" weight="medium">
                        {t('feature.onboarding.create-your-username')}
                    </Text>
                    <Text>{t('feature.onboarding.username-instructions')}</Text>
                    <InputWrapper>
                        <Input
                            label={t('words.username')}
                            placeholder={`${t(
                                'feature.onboarding.enter-username',
                            )}...`}
                            value={username}
                            onChange={ev => setUsername(ev.currentTarget.value)}
                            autoFocus
                            autoCapitalize="off"
                        />
                    </InputWrapper>
                </OnboardingContent>
                <OnboardingActions>
                    <Button
                        width="full"
                        type="submit"
                        disabled={!username}
                        loading={isSubmitting}>
                        {t('feature.onboarding.create-username')}
                    </Button>
                </OnboardingActions>
            </>
        )
    }

    return (
        <OnboardingContainer as="form" onSubmit={handleSubmit}>
            {content}
        </OnboardingContainer>
    )
}

const InputWrapper = styled('div', {
    width: '100%',
    marginTop: 16,
})
