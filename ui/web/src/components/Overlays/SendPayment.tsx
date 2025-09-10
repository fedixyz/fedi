import { useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { SendPaymentResponse } from 'webln'

import {
    listGateways,
    payInvoice,
    selectBtcExchangeRate,
    selectCurrency,
    selectInvoiceToPay,
    selectPaymentFederation,
    selectSiteInfo,
} from '@fedi/common/redux'
import { MSats } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { makeLog } from '@fedi/common/utils/log'

import { useAppDispatch, useAppSelector } from '../../hooks'
import { fedimint } from '../../lib/bridge'
import { styled, theme } from '../../styles'
import { Button } from '../Button'
import { Dialog } from '../Dialog'
import { FederationWalletSelector } from '../FederationWalletSelector'
import { HoloLoader } from '../HoloLoader'
import { Text } from '../Text'

const log = makeLog('SendPaymentOverlay')

interface Props {
    onAccept(res: SendPaymentResponse): void
    onReject(): void
}

export const SendPayment: React.FC<Props> = ({ onAccept, onReject }) => {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const paymentFederation = useAppSelector(selectPaymentFederation)
    const rate = useAppSelector(selectBtcExchangeRate)
    const currency = useAppSelector(selectCurrency)
    const invoice = useAppSelector(selectInvoiceToPay)
    const siteInfo = useAppSelector(selectSiteInfo)

    const [balanceInsufficient, setBalanceInsufficient] = useState(true)
    const [loading, setLoading] = useState<boolean>(false)

    useEffect(() => {
        if (!invoice || !paymentFederation) return

        setBalanceInsufficient(invoice.amount > paymentFederation.balance)
    }, [invoice, paymentFederation])

    const handleOnAccept = async () => {
        try {
            setLoading(true)
            if (!paymentFederation || !invoice) throw new Error()

            const gateways = await dispatch(
                listGateways({ fedimint, federationId: paymentFederation.id }),
            ).unwrap()

            if (gateways.length === 0) {
                throw new Error('No available lightning gateways')
            }

            if (paymentFederation.balance < invoice.amount) {
                throw new Error(
                    t('errors.insufficient-balance', {
                        balance: `${amountUtils.msatToSat(
                            paymentFederation.balance as MSats,
                        )} SATS`,
                    }),
                )
            }

            const res = await dispatch(
                payInvoice({
                    fedimint,
                    federationId: paymentFederation.id,
                    invoice: invoice.invoice,
                }),
            ).unwrap()

            onAccept(res)
        } catch (err) {
            log.error('Failed to pay invoice', invoice, err)
            onReject()
        } finally {
            setLoading(false)
        }
    }

    const fiatAmount = invoice?.amount
        ? amountUtils.msatToFiat(invoice.amount, rate)
        : 0
    const satsAmount = `${
        invoice?.amount ? amountUtils.msatToSat(invoice.amount) : 0
    } ${t('words.sats').toUpperCase()}`

    return (
        <Dialog
            open={!!invoice}
            onOpenChange={() => {}}
            mobileDismiss="overlay"
            disableClose
            disablePadding>
            <Container aria-label="payment request dialog">
                <Header>
                    <Text variant="body" weight="bold">
                        {t('feature.fedimods.payment-request', {
                            fediMod: siteInfo?.title,
                        })}
                    </Text>
                </Header>

                <Body>
                    {loading ? (
                        <HoloLoader size="lg" />
                    ) : (
                        <>
                            <FederationWalletSelector />
                            <Wrapper>
                                <FiatWrapper>
                                    <FiatAmount variant="h1" weight="medium">
                                        {fiatAmount}
                                    </FiatAmount>
                                    <Currency variant="h2" weight="normal">
                                        {currency}
                                    </Currency>
                                </FiatWrapper>
                                <SatsWrapper>
                                    <SatsAmount>{satsAmount}</SatsAmount>
                                </SatsWrapper>
                                {balanceInsufficient && (
                                    <WarningText variant="caption">
                                        <Trans
                                            i18nKey={
                                                'errors.invalid-amount-max'
                                            }
                                            components={{
                                                suggestion: <span />,
                                            }}
                                            values={{
                                                verb: t(
                                                    'words.send',
                                                ).toLowerCase(),
                                                amount: `${amountUtils.msatToSat(paymentFederation?.balance || (0 as MSats))} ${t(
                                                    'words.sats',
                                                )}`,
                                            }}
                                        />
                                    </WarningText>
                                )}
                            </Wrapper>
                        </>
                    )}
                </Body>

                <Footer>
                    <ButtonWrapper>
                        <Button
                            width="full"
                            variant="outline"
                            disabled={loading}
                            onClick={onReject}>
                            {t('words.reject')}
                        </Button>
                        <Button
                            width="full"
                            disabled={loading || balanceInsufficient}
                            onClick={handleOnAccept}>
                            {t('words.accept')}
                        </Button>
                    </ButtonWrapper>
                </Footer>
            </Container>
        </Dialog>
    )
}

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    height: '50dvh',
    maxHeight: 400,
    justifyContent: 'space-between',
    padding: 20,
    width: '100%',
})

const Header = styled('div', {
    display: 'flex',
    height: 100,
    justifyContent: 'center',
})

const Body = styled('div', {
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    gap: 10,
    justifyContent: 'flex-start',
    textAlign: 'center',
    width: '100%',
    zIndex: 10,
})

const Wrapper = styled('div', {
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    textAlign: 'center',
    width: 240,
})

const FiatWrapper = styled('div', {
    alignItems: 'baseline',
    display: 'flex',
    height: 50,
})

const FiatAmount = styled(Text, {})

const Currency = styled(Text, {
    marginLeft: 5,
})

const SatsWrapper = styled('div', {
    color: theme.colors.darkGrey,
})
const SatsAmount = styled(Text, {})

const WarningText = styled(Text, {
    color: theme.colors.red,
    marginTop: 10,
})

const Footer = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    height: 100,
    gap: 10,
    justifyContent: 'flex-end',
})

const ButtonWrapper = styled('div', {
    display: 'flex',
    gap: 10,
    width: '100%',
})
