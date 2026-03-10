import React from 'react'
import { useTranslation } from 'react-i18next'

import CheckIcon from '@fedi/common/assets/svgs/check.svg'
import { useAmountFormatter } from '@fedi/common/hooks/amount'
import {
    selectCurrency,
    selectLoadedFederations,
    selectPaymentFederation,
    setPayFromFederationId,
} from '@fedi/common/redux'
import { LoadedFederation, MSats } from '@fedi/common/types'

import { useAppDispatch, useAppSelector } from '../hooks'
import { styled } from '../styles'
import { Dialog } from './Dialog'
import { FederationAvatar } from './FederationAvatar'
import { Column } from './Flex'
import { Icon } from './Icon'
import { Text } from './Text'

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export const FederationsOverlay: React.FC<Props> = ({ onOpenChange, open }) => {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const federations = useAppSelector(selectLoadedFederations)
    const paymentFederation = useAppSelector(selectPaymentFederation)

    return (
        <Dialog
            title={t('phrases.select-federation')}
            open={open}
            onOpenChange={onOpenChange}
            type="tray">
            <Content>
                <Column>
                    {federations.map((f, i) => (
                        <FederationListItem
                            key={`federation-tile-${i}`}
                            federation={f}
                            isSelected={paymentFederation?.id === f.id}
                            handleFederationSelected={() =>
                                dispatch(setPayFromFederationId(f.id))
                            }
                        />
                    ))}
                </Column>
            </Content>
        </Dialog>
    )
}

function FederationListItem({
    federation,
    isSelected,
    handleFederationSelected,
}: {
    federation: LoadedFederation
    isSelected: boolean
    handleFederationSelected: (f: LoadedFederation) => void
}) {
    const selectedCurrency = useAppSelector(s =>
        selectCurrency(s, federation.id),
    )

    const { makeFormattedAmountsFromMSats } = useAmountFormatter({
        currency: selectedCurrency,
        federationId: federation.id,
    })

    const { formattedPrimaryAmount, formattedSecondaryAmount } =
        makeFormattedAmountsFromMSats(
            federation.balance || (0 as MSats),
            'end',
            true,
        )

    return (
        <FederationListItemButton
            onClick={() => handleFederationSelected(federation)}
            data-testid={`FederationListItem-${federation.id}`}>
            <FederationAvatar federation={federation} />
            <Column gap="xs" grow basis={false}>
                <Text weight="bold">{federation.name}</Text>
                <Text>
                    {`${formattedPrimaryAmount} (${formattedSecondaryAmount})`}
                </Text>
            </Column>
            {isSelected && <Icon icon={CheckIcon} size="sm" />}
        </FederationListItemButton>
    )
}

const FederationListItemButton = styled('button', {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 8,
    paddingBottom: 8,
    width: '100%',
    textAlign: 'left',
})

const Content = styled('div', {
    maxHeight: '60vh',
    overflow: 'auto',
})

export default FederationsOverlay
