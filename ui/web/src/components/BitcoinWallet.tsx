import Link from 'next/link'
import { useRouter } from 'next/router'
import React from 'react'
import { useTranslation } from 'react-i18next'

import ReceiveArrowIcon from '@fedi/common/assets/svgs/arrow-down.svg'
import SendArrowIcon from '@fedi/common/assets/svgs/arrow-right.svg'
import BitcoinCircleIcon from '@fedi/common/assets/svgs/bitcoin-circle.svg'
import TxnHistoryIcon from '@fedi/common/assets/svgs/txn-history.svg'
import { useBalance } from '@fedi/common/hooks/amount'
import { LoadedFederation } from '@fedi/common/types'

import { styled, theme } from '../styles'
import { Button } from './Button'
import { Icon } from './Icon'
import { IconButton } from './IconButton'
import { Text } from './Text'

const MIN_BALANCE_TO_SEND = 1000

type Props = {
    federation: LoadedFederation
}

export const BitcoinWallet: React.FC<Props> = ({ federation }) => {
    const { t } = useTranslation()
    const { push } = useRouter()
    const { formattedBalanceSats, formattedBalanceFiat } = useBalance(
        federation.id,
    )

    return (
        <Container data-testid="bitcoin-wallet">
            <Header>
                <HeaderLeft>
                    <IconWrapper>
                        <Icon size="md" icon={BitcoinCircleIcon} />
                    </IconWrapper>
                    <Name href="/transactions">
                        <Text weight="medium">{t('words.bitcoin')}</Text>
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
            <Buttons>
                <Button
                    variant="secondary"
                    outline
                    width="full"
                    onClick={() => push(`/request#id=${federation.id}`)}
                    icon={ReceiveArrowIcon}
                    style={{
                        flex: 1,
                    }}
                />
                <Button
                    variant="secondary"
                    outline
                    width="full"
                    onClick={() => push(`/send#id=${federation.id}`)}
                    icon={RotatedSendIcon}
                    disabled={federation.balance < MIN_BALANCE_TO_SEND}
                    style={{
                        flex: 1,
                    }}
                />
                <IconButton
                    variant="secondary"
                    outline
                    icon={TxnHistoryIcon}
                    size="lg"
                    onClick={() => push(`/transactions#id=${federation.id}`)}
                />
            </Buttons>
        </Container>
    )
}

const Container = styled('div', {
    padding: 16,
    borderRadius: 20,
    color: theme.colors.primary,
    background: `linear-gradient(${theme.colors.white}, ${theme.colors.primary10}), linear-gradient(${theme.colors.white}, ${theme.colors.white})`,
    border: `1.5px solid ${theme.colors.primaryVeryLight}`,
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
    gap: 12,

    '@xs': {
        flexDirection: 'column',
    },
})

const RotatedSendIcon = styled(SendArrowIcon, {
    transform: 'rotate(-45deg)',
})
