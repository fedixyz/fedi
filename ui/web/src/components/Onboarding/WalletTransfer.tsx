import React from 'react'
import { useTranslation } from 'react-i18next'

import arrowLoopRightIcon from '@fedi/common/assets/svgs/arrow-loop-right.svg'

import { styled, theme } from '../../styles'
import { Button } from '../Button'
import { Icon } from '../Icon'
import * as Layout from '../Layout'
import { Text } from '../Text'

export const WalletTransfer: React.FC = () => {
    const { t } = useTranslation()

    return (
        <Layout.Root>
            <Layout.Header>
                <Layout.Title subheader>
                    {t('feature.recovery.wallet-transfer')}
                </Layout.Title>
            </Layout.Header>
            <Layout.Content centered>
                <Content>
                    <Icon icon={arrowLoopRightIcon} size="lg" />
                    <Text variant="h2" weight="medium">
                        {t('feature.recovery.transfer-existing-wallet')}
                    </Text>
                    <Text variant="body">
                        {t(
                            'feature.recovery.transfer-existing-wallet-guidance-1',
                        )}
                    </Text>
                </Content>
            </Layout.Content>
            <Layout.Actions>
                <Text variant="small" css={{ color: theme.colors.grey }}>
                    {t('feature.recovery.transfer-existing-wallet-guidance-2')}
                </Text>
                <Button width="full" href="/onboarding/recover/select-device">
                    {t('words.continue')}
                </Button>
            </Layout.Actions>
        </Layout.Root>
    )
}

const Content = styled('div', {
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 20,
})
