import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAmountFormatter, useBalance } from '@fedi/common/hooks/amount'
import { useWalletFederationSelection } from '@fedi/common/hooks/federation'

import { styled, theme } from '../../styles'
import { FederationAvatar } from '../FederationAvatar'
import { Icon } from '../Icon'
import { Popover } from '../Popover'
import { Text } from '../Text'

export const FederationWalletSelector: React.FC<{
    allowedFederationIds?: string[]
}> = ({ allowedFederationIds }) => {
    const { t } = useTranslation()
    const [isSelectorOpen, setIsSelectorOpen] = useState(false)
    const { visibleFederations, selectedFederation, selectFederation } =
        useWalletFederationSelection(allowedFederationIds)

    const { formattedBalance: paymentFederationBalance } = useBalance(
        t,
        selectedFederation?.id || '',
    )
    const { makeFormattedAmountsFromMSats } = useAmountFormatter()

    const handleSelectFederation = useCallback(
        (id: string) => {
            selectFederation(id)
            setIsSelectorOpen(false)
        },
        [selectFederation],
    )

    const federationList = (
        <FederationList>
            {visibleFederations.map(fed => {
                const { formattedPrimaryAmount, formattedSecondaryAmount } =
                    makeFormattedAmountsFromMSats(fed.balance, 'end', true)

                return (
                    <FederationItem
                        key={fed.id}
                        aria-label="federation-item"
                        active={fed.id === selectedFederation?.id}
                        onClick={() => handleSelectFederation(fed.id)}>
                        <FederationAvatar federation={fed} size="sm" />
                        <div>
                            <Text variant="caption" weight="bold">
                                {fed.name}
                            </Text>
                            <Text variant="small">
                                {`${formattedPrimaryAmount} (${formattedSecondaryAmount})`}
                            </Text>
                        </div>
                    </FederationItem>
                )
            })}
        </FederationList>
    )

    if (!selectedFederation) return null

    return (
        <Popover
            content={federationList}
            open={isSelectorOpen}
            onOpenChange={setIsSelectorOpen}>
            <Container aria-label="federation-selector">
                <Wrapper>
                    <Inner key={selectedFederation?.id}>
                        <FederationAvatar
                            federation={selectedFederation}
                            size="sm"
                        />
                        <ActiveFederationTextWrapper>
                            <Text variant="body" weight="bold">
                                {selectedFederation.name}
                            </Text>
                            <Text variant="small">
                                {paymentFederationBalance}
                            </Text>
                        </ActiveFederationTextWrapper>
                        <IconWrapper isOpen={isSelectorOpen}>
                            <Icon size="sm" icon="ChevronRight" />
                        </IconWrapper>
                    </Inner>
                </Wrapper>
            </Container>
        </Popover>
    )
}

const Container = styled('div', {
    alignItems: 'center',
    background: theme.colors.offWhite100,
    boxSizing: 'border-box',
    borderRadius: 9999,
    display: 'flex',
    justifyContent: 'center',
    overflow: 'hidden',
    width: '100%',
})

const Wrapper = styled('div', {
    padding: '12px 15px',
    '& > button': {
        display: 'block',
    },
    width: '100%',
})

const Inner = styled('div', {
    alignItems: 'center',
    display: 'flex',
    gap: 8,
    justifyContent: 'space-between',
})

const IconWrapper = styled('div', {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'center',
    transition: 'transform 100ms ease',

    variants: {
        isOpen: {
            true: {
                transform: 'rotate(90deg)',
            },
        },
    },
})

const ActiveFederationTextWrapper = styled('div', {
    flex: 1,
    textAlign: 'left',
})

const FederationList = styled('ul', {
    margin: -8,
    padding: 0,

    '& > li': {
        listStyle: 'none',
    },
})

const FederationItem = styled('button', {
    alignItems: 'center',
    backgroundColor: `transparent`,
    borderRadius: 8,
    display: 'flex',
    gap: 8,
    padding: 8,
    textAlign: 'left',
    transition: 'background-color 100ms ease',

    '&:hover': {
        backgroundColor: theme.colors.primary10,
    },

    variants: {
        active: {
            true: {},
        },
    },
})
