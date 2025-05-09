import Link from 'next/link'
import { useRouter } from 'next/router'
import React from 'react'
import { useTranslation } from 'react-i18next'

import ReceiveArrowIcon from '@fedi/common/assets/svgs/arrow-down.svg'
import SendArrowIcon from '@fedi/common/assets/svgs/arrow-right.svg'
import BitcoinIcon from '@fedi/common/assets/svgs/bitcoin.svg'
import arrowRightIcon from '@fedi/common/assets/svgs/chevron-right.svg'
import { useBalance } from '@fedi/common/hooks/amount'
import { selectActiveFederation } from '@fedi/common/redux'

import { useAppSelector } from '../hooks'
import { styled, theme } from '../styles'
import { Button } from './Button'
import { Icon } from './Icon'
import { RequestPaymentDialog } from './RequestPaymentDialog'
import { SendPaymentDialog } from './SendPaymentDialog'
import { Text } from './Text'

const MIN_BALANCE_TO_SEND = 1000

export const BitcoinWallet: React.FC = () => {
    const { t } = useTranslation()
    const { pathname, push } = useRouter()
    const { formattedBalanceSats, formattedBalanceFiat } = useBalance()
    const activeFederation = useAppSelector(selectActiveFederation)

    return (
        <Container>
            <Header>
                <HeaderLeft>
                    <IconWrapper>
                        <Icon size="md" icon={BitcoinIcon} />
                    </IconWrapper>
                    <Name href="/transactions">
                        <Text weight="bold">{t('words.bitcoin')}</Text>
                        <Icon icon={arrowRightIcon} size={'xs'} />
                    </Name>
                </HeaderLeft>
                <HeaderRight>
                    {formattedBalanceFiat && (
                        <Text variant="body" weight="medium">
                            {formattedBalanceFiat}
                        </Text>
                    )}
                    {formattedBalanceSats && (
                        <Text variant="small" weight="normal">
                            {formattedBalanceSats}
                        </Text>
                    )}
                </HeaderRight>
            </Header>
            {activeFederation ? (
                <Buttons>
                    <Button
                        variant="secondary"
                        width="full"
                        onClick={() => push('/request')}
                        icon={ReceiveArrowIcon}>
                        {t('words.request')}
                    </Button>
                    <Button
                        variant="secondary"
                        width="full"
                        onClick={() => push('/send')}
                        icon={RotatedSendIcon}
                        disabled={
                            activeFederation.balance < MIN_BALANCE_TO_SEND
                        }>
                        {t('words.send')}
                    </Button>
                </Buttons>
            ) : (
                <Text variant="body">
                    {t('feature.wallet.join-federation')}
                </Text>
            )}
            <RequestPaymentDialog
                open={pathname === '/request'}
                onOpenChange={() => push('/home')}
            />
            <SendPaymentDialog
                open={pathname === '/send'}
                onOpenChange={() => push('/home')}
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
    justifyContent: 'space-between',
    marginBottom: 20,
})

const HeaderLeft = styled('div', {
    alignItems: 'center',
    display: 'flex',
    flex: 1,
    gap: 10,
})

const HeaderRight = styled('div', {
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    textAlign: 'right',
})

const Name = styled(Link, {
    alignItems: 'flex-end',
    display: 'flex',
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

const Buttons = styled('div', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,

    '@xs': {
        flexDirection: 'column',
    },
})

const RotatedSendIcon = styled(SendArrowIcon, {
    transform: 'rotate(-45deg)',
})
