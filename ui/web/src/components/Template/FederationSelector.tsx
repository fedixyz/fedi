import Link from 'next/link'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import ChevronRightIcon from '@fedi/common/assets/svgs/chevron-right.svg'
import PlusIcon from '@fedi/common/assets/svgs/plus.svg'
import { useAmountFormatter } from '@fedi/common/hooks/amount'
import {
    selectActiveFederation,
    selectFederations,
    setActiveFederationId,
} from '@fedi/common/redux'
import { FederationListItem, MSats } from '@fedi/common/types'

import { useAppDispatch, useAppSelector, useMediaQuery } from '../../hooks'
import { config, styled, theme } from '../../styles'
import { FederationAvatar } from '../FederationAvatar'
import { Icon } from '../Icon'
import { Popover } from '../Popover'
import { Text } from '../Text'

export const FederationSelector: React.FC = () => {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const activeFederation = useAppSelector(selectActiveFederation)
    const federations = useAppSelector(selectFederations)
    const [isSelectorOpen, setIsSelectorOpen] = useState(false)
    const isSmall = useMediaQuery(config.media.sm)
    const { makeFormattedAmountsFromMSats } = useAmountFormatter()

    const handleSelectFederation = useCallback(
        (fed: FederationListItem) => {
            dispatch(setActiveFederationId(fed.id))
            setIsSelectorOpen(false)
        },
        [dispatch],
    )

    if (!activeFederation) return null

    const federationList = (
        <FederationList>
            {federations.map(fed => {
                const { formattedPrimaryAmount, formattedSecondaryAmount } =
                    makeFormattedAmountsFromMSats(
                        fed.hasWallet ? fed.balance : (0 as MSats),
                    )
                return (
                    <li key={fed.id}>
                        <FederationItem
                            active={fed.id === activeFederation.id}
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
                    </li>
                )
            })}
            <li>
                <FederationItem add as={Link} href="/onboarding/join">
                    <Icon icon={PlusIcon} size="sm" />
                    <Text variant="caption" weight="bold">
                        {t('feature.federations.add-federation')}
                    </Text>
                </FederationItem>
            </li>
        </FederationList>
    )

    return (
        <Container>
            <Popover
                content={federationList}
                sideOffset={10}
                open={isSelectorOpen}
                onOpenChange={setIsSelectorOpen}>
                <ActiveFederation key={activeFederation?.id}>
                    <FederationAvatar
                        federation={activeFederation}
                        size={isSmall ? 'xs' : 'sm'}
                    />
                    <Text variant="caption" weight="bold">
                        {activeFederation.name}
                    </Text>
                    <IconWrapper isOpen={isSelectorOpen}>
                        <Icon size="xs" icon={ChevronRightIcon} />
                    </IconWrapper>
                </ActiveFederation>
            </Popover>
        </Container>
    )
}

const Container = styled('div', {
    '& > button': {
        display: 'block',
    },
})

const ActiveFederation = styled('div', {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
})

const IconWrapper = styled('div', {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -4,
    transition: 'transform 100ms ease',

    variants: {
        isOpen: {
            true: {
                transform: 'rotate(90deg)',
            },
        },
    },
})

const FederationList = styled('ul', {
    width: 260,
    padding: 0,
    margin: -8,

    '& > li': {
        listStyle: 'none',
    },
})

const FederationItem = styled('button', {
    display: 'flex',
    alignItems: 'center',
    textAlign: 'left',
    width: '100%',
    gap: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: `transparent`,
    transition: 'background-color 100ms ease',

    '&:hover': {
        backgroundColor: theme.colors.primary10,
    },

    variants: {
        active: {
            true: {},
        },
        add: {
            true: {
                opacity: 0.6,

                '&:hover': {
                    opacity: 1,
                },
            },
        },
    },
})
