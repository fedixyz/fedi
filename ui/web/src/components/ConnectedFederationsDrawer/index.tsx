import { useRouter } from 'next/router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import PlusIcon from '@fedi/common/assets/svgs/plus.svg'
import { useAmountFormatter } from '@fedi/common/hooks/amount'
import {
    selectActiveFederation,
    selectLoadedFederations,
    setActiveFederationId,
} from '@fedi/common/redux'
import { MSats } from '@fedi/common/types'

import { onboardingRoute } from '../../constants/routes'
import { useAppSelector, useAppDispatch } from '../../hooks'
import { keyframes, styled, theme } from '../../styles'
import { Button } from '../Button'
import { FederationAvatar } from '../FederationAvatar'
import { Text } from '../Text'

type Props = {
    onClose(): void
}

export const ConnectedFederationsDrawer: React.FC<Props> = ({ onClose }) => {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const { push } = useRouter()

    const federations = useAppSelector(selectLoadedFederations)
    const activeFederation = useAppSelector(selectActiveFederation)
    const { makeFormattedAmountsFromMSats } = useAmountFormatter()

    useEffect(() => {
        return () => onClose()
    }, [onClose])

    const handleSelectFederation = (id: string) => {
        // Ensures that drawer will close when selecting selected federation
        if (id === activeFederation?.id) {
            onClose()
            return
        }

        dispatch(setActiveFederationId(id))
    }

    const handleOnAdd = () => {
        push(onboardingRoute)
    }

    return (
        <>
            <Overlay onClick={onClose} />
            <Menu>
                <MenuHeader>
                    <Text variant="caption" weight="bold">
                        {t('phrases.my-communities')}
                    </Text>
                    {federations.length === 0 && (
                        <Text
                            variant="small"
                            css={{ color: theme.colors.darkGrey }}>
                            {t('feature.federations.drawer-subtitle')}
                        </Text>
                    )}
                </MenuHeader>
                <MenuItems>
                    <Federations>
                        {federations.map(fed => {
                            const {
                                formattedPrimaryAmount,
                                formattedSecondaryAmount,
                            } = makeFormattedAmountsFromMSats(
                                fed.hasWallet ? fed.balance : (0 as MSats),
                            )
                            return (
                                <Federation
                                    key={fed.id}
                                    aria-label="federation"
                                    selected={fed.id === activeFederation?.id}
                                    onClick={() =>
                                        handleSelectFederation(fed.id)
                                    }>
                                    <FederationAvatar
                                        federation={fed}
                                        size="sm"
                                    />
                                    <FederationText>
                                        <Text variant="caption" weight="bold">
                                            {fed.name}
                                        </Text>
                                        {fed.hasWallet && (
                                            <Text
                                                variant="tiny"
                                                css={{
                                                    color: theme.colors
                                                        .darkGrey,
                                                }}>
                                                {`${formattedPrimaryAmount} (${formattedSecondaryAmount})`}
                                            </Text>
                                        )}
                                    </FederationText>
                                </Federation>
                            )
                        })}
                    </Federations>
                </MenuItems>
                <MenuFooter>
                    <Button onClick={handleOnAdd} width="full" icon={PlusIcon}>
                        Add
                    </Button>
                </MenuFooter>
            </Menu>
        </>
    )
}

const slideIn = keyframes({
    '0%': { marginLeft: -240 },
    '100%': { marginLeft: 0 },
})

const fadeIn = keyframes({
    '0%': { opacity: 0 },
    '100%': { opacity: 0.4 },
})

const Overlay = styled('div', {
    animation: `${fadeIn} .3s ease`,
    background: theme.colors.black,
    opacity: 0.4,
    position: 'fixed',
    bottom: 0,
    left: 0,
    top: 0,
    right: 0,
    zIndex: 9,
})

const Menu = styled('div', {
    animation: `${slideIn} .2s ease`,
    background: theme.colors.white,
    bottom: 0,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    holoGradient: '100',
    justifyContent: 'space-between',
    left: 0,
    position: 'fixed',
    top: 0,
    width: 240,
    zIndex: 10,
})

const MenuHeader = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 20,
})

const MenuItems = styled('div', {
    alignItems: 'flex-start',
    display: 'flex',
    flex: 1,
    overflowY: 'scroll',
    width: '100%',
})

const MenuFooter = styled('div', {
    padding: 20,
    width: '100%',
})

const Federations = styled('div', {
    width: '100%',
})

const Federation = styled('div', {
    alignItems: 'center',
    cursor: 'pointer',
    display: 'flex',
    gap: 10,
    padding: '10px 20px',
    width: '100%',

    '&:active': {
        background: theme.colors.primary20,
    },

    variants: {
        selected: {
            true: {
                background: theme.colors.primary10,
            },
        },
    },
})

const FederationText = styled('div', {
    display: 'flex',
    flexDirection: 'column',
})
