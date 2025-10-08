import React from 'react'
import { useTranslation } from 'react-i18next'

// import SocialPeopleIcon from '@fedi/common/assets/svgs/social-people.svg'
import WordListIcon from '@fedi/common/assets/svgs/word-list.svg'

import { ActionCard } from '../../components/ActionCard'
import { Button } from '../../components/Button'
import { styled } from '../../styles'
import * as Layout from '../Layout'

export const WalletRecovery: React.FC = () => {
    const { t } = useTranslation()

    return (
        <Layout.Root>
            <Layout.Header back="/">
                <Layout.Title subheader>
                    {t('feature.recovery.choose-method')}
                </Layout.Title>
            </Layout.Header>

            <Layout.Content fullWidth centered>
                <Cards>
                    <ActionCard
                        icon={WordListIcon}
                        title={t('feature.recovery.personal-recovery')}
                        description={t(
                            'feature.recovery.personal-recovery-instructions',
                        )}
                        action={
                            <Button href="/onboarding/recover/personal">
                                {t('feature.recovery.start-personal-recovery')}
                            </Button>
                        }
                    />
                    {/* Disabled until social recovery is supported on web */}
                    {/* <ActionCard
                        icon={SocialPeopleIcon}
                        title={t('feature.recovery.social-recovery')}
                        description={t(
                            'feature.recovery.social-recovery-instructions',
                        )}
                        action={
                            <Button href="/onboarding/recover/social">
                                {t('feature.recovery.start-social-recovery')}
                            </Button>
                        }
                    /> */}
                </Cards>
            </Layout.Content>
        </Layout.Root>
    )
}

const Cards = styled('div', {
    alignItems: 'center',
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 16,
    padding: 20,
})
