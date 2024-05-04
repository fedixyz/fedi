import Link from 'next/link'
import { useRouter } from 'next/router'
import React from 'react'
import { useTranslation } from 'react-i18next'

import BitcoinIcon from '@fedi/common/assets/svgs/bitcoin.svg'
import ListIcon from '@fedi/common/assets/svgs/list.svg'
import { useBalance } from '@fedi/common/hooks/amount'
import { selectActiveFederation } from '@fedi/common/redux'

import { useAppSelector } from '../hooks'
import { styled, theme } from '../styles'
import { Button } from './Button'
import { Icon } from './Icon'
import { RequestPaymentDialog } from './RequestPaymentDialog'
import { SendPaymentDialog } from './SendPaymentDialog'
import { Text } from './Text'

export const BitcoinWallet: React.FC = () => {
    const { t } = useTranslation()
    const { pathname, push } = useRouter()
    const { formattedBalanceSats, formattedBalanceFiat } = useBalance()
    const activeFederation = useAppSelector(selectActiveFederation)

    if (!activeFederation || !activeFederation.hasWallet) return null

    return (
        <Container>
            <Header>
                <IconWrapper>
                    <Icon size="md" icon={BitcoinIcon} />
                </IconWrapper>
                <Name>
                    <Text weight="bold">{t('words.bitcoin')}</Text>
                </Name>
                <Link href="/transactions">
                    <Icon icon={ListIcon} />
                </Link>
            </Header>
            <Balance>
                {formattedBalanceFiat && (
                    <Text variant="h2" weight="normal">
                        {formattedBalanceFiat}
                    </Text>
                )}
                {formattedBalanceSats && (
                    <Text variant="caption" weight="medium">
                        {formattedBalanceSats}
                    </Text>
                )}
            </Balance>
            <Buttons>
                <Button
                    variant="secondary"
                    width="full"
                    onClick={() => push('/request')}>
                    {t('words.request')}
                </Button>
                <Button
                    variant="secondary"
                    width="full"
                    onClick={() => push('/send')}
                    disabled={activeFederation.balance < 1000}>
                    {t('words.send')}
                </Button>
            </Buttons>
            <RequestPaymentDialog
                open={pathname === '/request'}
                onOpenChange={() => push('/')}
            />
            <SendPaymentDialog
                open={pathname === '/send'}
                onOpenChange={() => push('/')}
            />
        </Container>
    )
}

const Container = styled('div', {
    padding: 16,
    borderRadius: 20,
    color: theme.colors.white,
    backgroundColor: theme.colors.orange,
})

const Header = styled('div', {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
})

const Name = styled('div', {
    flex: 1,
})

const IconWrapper = styled('div', {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: 32,
    width: 32,
    background: theme.colors.white,
    color: theme.colors.orange,
    borderRadius: '100%',
})

const Balance = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center',
    gap: 2,
    marginBottom: 20,
})

const Buttons = styled('div', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,

    '@xs': {
        flexDirection: 'column',
    },
})
