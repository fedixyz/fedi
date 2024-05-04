import { useRouter } from 'next/router'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BIP39_WORD_LIST } from '@fedi/common/constants/bip39'
import { useToast } from '@fedi/common/hooks/toast'
import { recoverFromMnemonic } from '@fedi/common/redux'
import { SeedWords } from '@fedi/common/types'

import { Button } from '../../components/Button'
import { RecoverySeedWords } from '../../components/RecoverySeedWords'
import { Text } from '../../components/Text'
import { useAppDispatch } from '../../hooks'
import { fedimint } from '../../lib/bridge'
import { styled } from '../../styles'
import { Header, Title } from '../Layout'
import {
    OnboardingActions,
    OnboardingContainer,
    OnboardingContent,
} from './components'

export const PersonalRecovery: React.FC = () => {
    const { t } = useTranslation()
    const toast = useToast()
    const { push } = useRouter()
    const dispatch = useAppDispatch()
    const [words, setWords] = useState<SeedWords>([])
    const [isRecovering, setIsRecovering] = useState(false)

    const isValid =
        words.length && words.every(word => BIP39_WORD_LIST.includes(word))

    const handleRecovery = useCallback(async () => {
        setIsRecovering(true)
        try {
            await dispatch(
                recoverFromMnemonic({
                    fedimint,
                    mnemonic: words,
                }),
            ).unwrap()
            push('/')
        } catch (err) {
            toast.error(t, err, 'errors.unknown-error')
        }
        setIsRecovering(false)
    }, [words, dispatch, toast, push, t])

    return (
        <OnboardingContainer>
            <Header back="/onboarding/recover">
                <Title subheader>
                    {t('feature.recovery.personal-recovery')}
                </Title>
            </Header>
            <OnboardingContent fullWidth>
                <Content>
                    <Text>
                        {t('feature.recovery.personal-recovery-instructions')}
                    </Text>
                    <RecoverySeedWords words={words} onChangeWords={setWords} />
                </Content>
            </OnboardingContent>
            <OnboardingActions>
                <Button
                    width="full"
                    onClick={handleRecovery}
                    disabled={!isValid}
                    loading={isRecovering}>
                    {t('feature.recovery.recover-wallet')}
                </Button>
            </OnboardingActions>
        </OnboardingContainer>
    )
}

const Content = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
})
