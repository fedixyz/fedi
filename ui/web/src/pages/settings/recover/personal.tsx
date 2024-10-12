import { useRouter } from 'next/router'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BIP39_WORD_LIST } from '@fedi/common/constants/bip39'
import { useToast } from '@fedi/common/hooks/toast'
import { recoverFromMnemonic } from '@fedi/common/redux'
import { SeedWords } from '@fedi/common/types'

import { Button } from '../../../components/Button'
import { ContentBlock } from '../../../components/ContentBlock'
import * as Layout from '../../../components/Layout'
import { RecoverySeedWords } from '../../../components/RecoverySeedWords'
import { Text } from '../../../components/Text'
import { useAppDispatch } from '../../../hooks'
import { fedimint } from '../../../lib/bridge'
import { styled } from '../../../styles'

function PersonalRecoverPage() {
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
            toast.show({
                content: t('feature.recovery.you-completed-personal-recovery'),
            })
        } catch (err) {
            toast.error(t, err, 'errors.unknown-error')
        }
        setIsRecovering(false)
    }, [words, dispatch, toast, t, push])

    return (
        <ContentBlock>
            <Layout.Header>
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
                    <Button
                        onClick={handleRecovery}
                        disabled={!isValid}
                        loading={isRecovering}>
                        {t('feature.recovery.recover-wallet')}
                    </Button>
                </Content>
            </Layout.Content>
        </ContentBlock>
    )
}

const Content = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    marginTop: 16,
})

export default PersonalRecoverPage
