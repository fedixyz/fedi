import React from 'react'
import { useTranslation } from 'react-i18next'

import WalletIcon from '@fedi/common/assets/svgs/wallet.svg'
import { useTotalBalance } from '@fedi/common/hooks/amount'

import { styled, theme } from '../styles'
import { Row } from './Flex'
import { Icon } from './Icon'
import { Text } from './Text'

export const TotalBalance: React.FC = () => {
    const { t } = useTranslation()
    const { shouldHideTotalBalance, formattedBalance, changeDisplayCurrency } =
        useTotalBalance()

    if (shouldHideTotalBalance) return null

    return (
        <Container
            onClick={changeDisplayCurrency}
            align="center"
            gap="xs"
            aria-label="Total Balance">
            <Icon icon={WalletIcon} size="xs" />
            <Text variant="small" weight="medium">
                {t('words.balance')}: {formattedBalance}
            </Text>
        </Container>
    )
}

const Container = styled(Row, {
    background: theme.colors.secondary,
    border: `1px solid ${theme.colors.extraLightGrey}`,
    borderRadius: 11,
    height: 22,
    padding: theme.spacing.sm,
})
