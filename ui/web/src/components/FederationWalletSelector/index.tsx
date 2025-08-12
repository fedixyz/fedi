import React, { useCallback, useState } from 'react'

import ChevronRightIcon from '@fedi/common/assets/svgs/chevron-right.svg'
import { useAmountFormatter } from '@fedi/common/hooks/amount'
import {
    selectWalletFederations,
    setPayFromFederationId,
    selectPaymentFederation,
} from '@fedi/common/redux'
import { FederationListItem, MSats } from '@fedi/common/types'

import { useAppDispatch, useAppSelector } from '../../hooks'
import { styled, theme } from '../../styles'
import { FederationAvatar } from '../FederationAvatar'
import { Icon } from '../Icon'
import { Popover } from '../Popover'
import { Text } from '../Text'

export const FederationWalletSelector: React.FC = () => {
    const dispatch = useAppDispatch()
    const paymentFederation = useAppSelector(selectPaymentFederation)
    const federations = useAppSelector(selectWalletFederations)
    const [isSelectorOpen, setIsSelectorOpen] = useState(false)

    const { makeFormattedAmountsFromMSats } = useAmountFormatter()
    const handleSelectFederation = useCallback(
        (fed: FederationListItem) => {
            dispatch(setPayFromFederationId(fed.id))
            setIsSelectorOpen(false)
        },
        [dispatch],
    )

    const {
        formattedPrimaryAmount: activeFederationPrimaryAmount,
        formattedSecondaryAmount: activeFederationSecondaryAmount,
    } = makeFormattedAmountsFromMSats(
        paymentFederation?.hasWallet ? paymentFederation.balance : (0 as MSats),
    )

    const federationList = (
        <FederationList>
            {federations.map(fed => {
                const { formattedPrimaryAmount, formattedSecondaryAmount } =
                    makeFormattedAmountsFromMSats(
                        fed.hasWallet ? fed.balance : (0 as MSats),
                    )
                return (
                    <FederationItem
                        key={fed.id}
                        aria-label="federation-item"
                        active={fed.id === paymentFederation?.id}
                        onClick={() => handleSelectFederation(fed)}>
                        <FederationAvatar federation={fed} size="sm" />
                        <div>
                            <Text variant="caption" weight="bold">
                                {fed.name}
                            </Text>
                            {fed.hasWallet && (
                                <Text variant="small">
                                    {`${formattedPrimaryAmount} (${formattedSecondaryAmount})`}
                                </Text>
                            )}
                        </div>
                    </FederationItem>
                )
            })}
        </FederationList>
    )

    if (!paymentFederation) return null

    return (
        <Popover
            content={federationList}
            open={isSelectorOpen}
            onOpenChange={setIsSelectorOpen}>
            <Container aria-label="federation-selector">
                <Wrapper>
                    <Inner key={paymentFederation?.id}>
                        <FederationAvatar
                            federation={paymentFederation}
                            size="sm"
                        />
                        <ActiveFederationTextWrapper>
                            <Text variant="body" weight="bold">
                                {paymentFederation.name}
                            </Text>
                            {paymentFederation.hasWallet && (
                                <Text variant="small">
                                    {`${activeFederationPrimaryAmount} (${activeFederationSecondaryAmount})`}
                                </Text>
                            )}
                        </ActiveFederationTextWrapper>
                        <IconWrapper isOpen={isSelectorOpen}>
                            <Icon size="sm" icon={ChevronRightIcon} />
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
