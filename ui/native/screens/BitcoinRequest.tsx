import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Insets, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useIsOnchainDepositSupported } from '@fedi/common/hooks/federation'
import { selectActiveFederationId } from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../bridge'
import ReceiveQr from '../components/feature/receive/ReceiveQr'
import RequestTypeSwitcher from '../components/feature/receive/RequestTypeSwitcher'
import FiatAmount from '../components/feature/wallet/FiatAmount'
import { useAppSelector, useBridge } from '../state/hooks'
import { BitcoinOrLightning, BtcLnUri, MSats } from '../types'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('BitcoinRequest')

export type Props = NativeStackScreenProps<RootStackParamList, 'BitcoinRequest'>

const BitcoinRequest: React.FC<Props> = ({ route }: Props) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const insets = useSafeAreaInsets()
    const { generateAddress } = useBridge()
    const federationId = useAppSelector(selectActiveFederationId)
    const { uri } = route.params
    const isOnchainSupported = useIsOnchainDepositSupported()

    const [isLoading, setIsLoading] = useState<boolean>(false)
    const [requestType, setRequestType] = useState<BitcoinOrLightning>(
        BitcoinOrLightning.lightning,
    )
    const [requestAmount, setRequestAmount] = useState<MSats | null>(null)
    const [requestNote, setRequestNote] = useState<string | null>(null)
    const [decodedUri, setDecodedUri] = useState<BtcLnUri>(
        new BtcLnUri({
            type: BitcoinOrLightning.lightning,
            body: '',
            paramsString: null,
        }),
    )
    const [onchainAddress, setOnchainAddress] = useState<string>('')

    const decodeUri = useCallback(() => {
        const prefixIndex = uri.indexOf(':')
        const prefix = uri.substring(0, prefixIndex)

        let body = uri.substring(prefixIndex + 1)
        let params = null

        const paramsIndex = uri.indexOf('?')
        if (paramsIndex !== -1) {
            body = uri.substring(prefixIndex + 1, paramsIndex)
            params = uri.substring(paramsIndex + 1)
        }
        setDecodedUri(
            new BtcLnUri({
                type: prefix as BitcoinOrLightning,
                body,
                paramsString: params,
            }),
        )
    }, [uri])

    // Decodes the URI (bitcoin:xxx or lighting:xxx) passed as params
    useEffect(() => {
        decodeUri()
    }, [decodeUri])

    // Decodes the invoice from decodedUri
    useEffect(() => {
        if (
            decodedUri.type === BitcoinOrLightning.lightning &&
            decodedUri.body
        ) {
            setRequestType(BitcoinOrLightning.lightning)
            const getDecodedInvoice = async () => {
                try {
                    const decoded = await fedimint.decodeInvoice(
                        decodedUri.body,
                        federationId,
                    )
                    log.info('decoded invoice', decoded)
                    setRequestAmount(decoded.amount)
                    setRequestNote(decoded.description)
                    // TODO: Integrate private notes
                    // setRequestNote(decoded.note)
                } catch (error) {
                    log.error('error decoding invoice', error)
                }
            }
            getDecodedInvoice()
        }
    }, [decodedUri, federationId])

    // Generate onchain address if needed
    useEffect(() => {
        if (requestType === BitcoinOrLightning.bitcoin && !onchainAddress) {
            const generateOnchainAddress = async () => {
                try {
                    setIsLoading(true)
                    const newAddress = await generateAddress()

                    setOnchainAddress(newAddress)
                } catch (error) {
                    log.error('error generating address', error)
                }
                setIsLoading(false)
            }

            generateOnchainAddress()
        }
    }, [generateAddress, onchainAddress, requestType])

    const showOnchainDeposits = isOnchainSupported

    if (!decodedUri.body) {
        return <ActivityIndicator />
    }

    const style = styles(theme, insets)
    return (
        <View style={style.container}>
            {showOnchainDeposits && (
                <RequestTypeSwitcher
                    requestType={requestType}
                    onSwitch={() => {
                        requestType === BitcoinOrLightning.lightning
                            ? setRequestType(BitcoinOrLightning.bitcoin)
                            : setRequestType(BitcoinOrLightning.lightning)
                    }}
                />
            )}

            <View style={style.detailsContainer}>
                {requestAmount && (
                    <>
                        <Text h2>{`${amountUtils.formatNumber(
                            amountUtils.msatToSat(requestAmount),
                        )} ${t('words.sats').toUpperCase()}`}</Text>
                        <FiatAmount
                            amountSats={amountUtils.msatToSat(requestAmount)}
                        />
                    </>
                )}
                {requestNote && <Text small>{requestNote}</Text>}
            </View>
            {isLoading ? (
                <ActivityIndicator />
            ) : (
                <ReceiveQr
                    uri={
                        requestType === BitcoinOrLightning.lightning
                            ? decodedUri
                            : new BtcLnUri({
                                  type: BitcoinOrLightning.bitcoin,
                                  body: onchainAddress,
                                  paramsString: `amount=${amountUtils.msatToBtcString(
                                      requestAmount as MSats,
                                  )}${
                                      requestNote
                                          ? `&message=${requestNote}`
                                          : ''
                                  }`,
                              })
                    }
                    type={requestType}
                />
            )}
        </View>
    )
}

const styles = (theme: Theme, insets: Insets) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: theme.spacing.xl,
            paddingHorizontal: theme.spacing.xl,
            paddingBottom: Math.max(theme.spacing.xl, insets.bottom || 0),
        },
        detailsContainer: {
            paddingVertical: theme.spacing.md,
        },
    })

export default BitcoinRequest
