import { useRouter } from 'next/router'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useDisplayNameForm } from '@fedi/common/hooks/chat'

import { styled } from '../../styles'
import { Button } from '../Button'
import { Input } from '../Input'
import { Redirect } from '../Redirect'
import { Text } from '../Text'
import {
    OnboardingActions,
    OnboardingContainer,
    OnboardingContent,
} from './components'

export const EnterDisplayName: React.FC = () => {
    const { t } = useTranslation()
    const { push } = useRouter()
    const {
        username,
        isSubmitting,
        handleChangeUsername,
        handleSubmitDisplayName,
    } = useDisplayNameForm(t)
    const [hasSubmitted, setHasSubmitted] = useState(false)

    const handleSubmit = useCallback(
        async (ev: React.FormEvent) => {
            ev.preventDefault()
            setHasSubmitted(true)
            handleSubmitDisplayName(() => {
                push('/onboarding/image')
            })
        },
        [handleSubmitDisplayName, push],
    )

    // Make sure to only redirect if the user hasn't submitted a profile image.
    // This would override the push('/onboarding/image')
    if (!isSubmitting && !hasSubmitted) {
        return <Redirect path="/onboarding/complete" />
    }

    return (
        <OnboardingContainer as="form" onSubmit={handleSubmit}>
            <OnboardingContent>
                <Text variant="h2" weight="medium">
                    {t('feature.chat.enter-display-name')}
                </Text>
                <Text>{t('feature.onboarding.username-instructions')}</Text>
                <InputWrapper>
                    <Input
                        label={t('feature.chat.display-name')}
                        value={username}
                        onChange={ev =>
                            handleChangeUsername(ev.currentTarget.value)
                        }
                        disabled={isSubmitting}
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
                    {t('words.continue')}
                </Button>
            </OnboardingActions>
        </OnboardingContainer>
    )
}

const InputWrapper = styled('div', {
    width: '100%',
    marginTop: 16,
})
