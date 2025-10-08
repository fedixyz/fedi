import { useRouter } from 'next/router'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BIP39_WORD_LIST } from '@fedi/common/constants/bip39'
import { usePersonalRecovery } from '@fedi/common/hooks/recovery'
import { useToast } from '@fedi/common/hooks/toast'
import { selectIsInternetUnreachable } from '@fedi/common/redux'
import { SeedWords } from '@fedi/common/types'

import { Button } from '../../components/Button'
import { RecoverySeedWords } from '../../components/RecoverySeedWords'
import Success from '../../components/Success'
import { Text } from '../../components/Text'
import { useAppSelector } from '../../hooks'
import { fedimint } from '../../lib/bridge'
import { styled } from '../../styles'
import * as Layout from '../Layout'

export const PersonalRecovery: React.FC = () => {
    const { t } = useTranslation()
    const toast = useToast()
    const router = useRouter()
    const isNetworkUnreachable = useAppSelector(selectIsInternetUnreachable)

    const { recoveryInProgress, attemptRecovery } = usePersonalRecovery(
        t,
        fedimint,
    )

    const [words, setWords] = useState<SeedWords>([])
    const [success, setSuccess] = useState<boolean>(false)

    const isValid =
        words.length && words.every(word => BIP39_WORD_LIST.includes(word))

    const handleRecovery = useCallback(async () => {
        if (isNetworkUnreachable) {
            toast.error(t, t('errors.recovery-failed-connection'))
            return
        }

        attemptRecovery(words, () => {
            setSuccess(true)
        })
    }, [attemptRecovery, isNetworkUnreachable, words, toast, t])

    if (success) {
        return (
            <Success
                title={t('feature.recovery.you-completed-personal-recovery')}
                buttonText={t('words.continue')}
                onClick={() =>
                    router.push('/onboarding/recover/wallet-transfer')
                }
            />
        )
    }

    return (
        <Layout.Root>
            <Layout.Header back="/onboarding/recover">
                <Layout.Title subheader>
                    {t('feature.recovery.personal-recovery')}
                </Layout.Title>
            </Layout.Header>
            <Layout.Content>
                <Content>
                    <Text>
                        {t('feature.recovery.personal-recovery-instructions')}
                    </Text>
                    <RecoverySeedWords words={words} onChangeWords={setWords} />
                </Content>
            </Layout.Content>
            <Layout.Actions>
                <Button
                    width="full"
                    onClick={handleRecovery}
                    disabled={!isValid}
                    loading={recoveryInProgress}>
                    {t('feature.recovery.recover-wallet')}
                </Button>
            </Layout.Actions>
        </Layout.Root>
    )
}

const Content = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    textAlign: 'left',
})
