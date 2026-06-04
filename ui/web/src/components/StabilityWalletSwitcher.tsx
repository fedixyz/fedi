import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useBalance } from '@fedi/common/hooks/amount'
import { useStabilityPool } from '@fedi/common/hooks/stabilitypool'
import { LoadedFederation } from '@fedi/common/types'

import { styled, theme } from '../styles'
import { FederationAvatar } from './FederationAvatar'
import FederationsOverlay from './FederationsOverlay'
import { Icon } from './Icon'
import { Text } from './Text'

type Props = {
    federation: LoadedFederation
    showSwitcher?: boolean
    balanceDescription?: string
    badgeLogo?: 'usd' | 'btc'
    balance?: string
}

export const StabilityWalletSwitcher: React.FC<Props> = ({
    federation,
    showSwitcher = false,
    balanceDescription,
    badgeLogo,
    balance,
}) => {
    const { t } = useTranslation()
    const { formattedStableBalance } = useStabilityPool(federation.id)
    const { formattedBalanceFiat } = useBalance(t, federation.id)
    const [showFederationsOverlay, setShowFederationsOverlay] = useState(false)

    const displayedBalance =
        balance ||
        (badgeLogo === 'usd' ? formattedStableBalance : formattedBalanceFiat)

    return (
        <>
            <Container
                aria-label="stability-balance-tile"
                {...(showSwitcher
                    ? {
                          onClick: () => setShowFederationsOverlay(true),
                      }
                    : {})}>
                <Content>
                    <AvatarWrapper>
                        <FederationAvatar federation={federation} size="sm" />
                        <Badge
                            css={{
                                color:
                                    badgeLogo === 'usd'
                                        ? theme.colors.mint
                                        : theme.colors.orange,
                            }}>
                            <Icon
                                icon={
                                    badgeLogo === 'usd'
                                        ? 'UsdCircleFilled'
                                        : 'BitcoinCircle'
                                }
                                size={20}
                            />
                        </Badge>
                    </AvatarWrapper>
                    <TextWrapper>
                        <Text
                            variant="caption"
                            weight="bold"
                            ellipsize
                            css={{ width: '100%' }}>
                            {federation.name}
                        </Text>
                        <Text
                            variant="caption"
                            weight="medium"
                            ellipsize
                            css={{
                                color: theme.colors.darkGrey,
                                width: '100%',
                            }}>
                            {balanceDescription ||
                                t('feature.stabilitypool.available-balance')}
                            : {displayedBalance}
                        </Text>
                    </TextWrapper>
                </Content>
                {showSwitcher && <Icon icon="ChevronRight" size="sm" />}
            </Container>

            <FederationsOverlay
                open={showFederationsOverlay}
                onOpenChange={setShowFederationsOverlay}
            />
        </>
    )
}

const Container = styled('div', {
    alignItems: 'center',
    backgroundColor: theme.colors.grey50,
    borderRadius: 16,
    boxSizing: 'border-box',
    display: 'flex',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    textAlign: 'left',
    width: '100%',
})

const Content = styled('div', {
    alignItems: 'center',
    display: 'flex',
    flex: 1,
    gap: theme.spacing.md,
    minWidth: 0,
})

const AvatarWrapper = styled('div', {
    alignItems: 'center',
    display: 'flex',
    flexShrink: 0,
    position: 'relative',
})

const Badge = styled('div', {
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    borderRadius: 9999,
    display: 'flex',
    justifyContent: 'center',
    padding: 2,
    position: 'absolute',
    right: 0,
    top: 0,
    transform: 'translate(calc(50% - 2px), calc(-50% + 2px))',
})

const TextWrapper = styled('div', {
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    textAlign: 'left',
})
