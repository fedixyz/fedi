import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React from 'react'

import { useSpv2OurPaymentAddress } from '@fedi/common/hooks/stabilitypool'

import { fedimint } from '../bridge'
import ReceiveQr from '../components/feature/receive/ReceiveQr'
import StabilityWalletTitle from '../components/feature/stabilitypool/StabilityWalletTitle'
import { Column } from '../components/ui/Flex'
import { SafeScrollArea } from '../components/ui/SafeArea'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ReceiveStabilityQr'
>

const ReceiveStabilityQr: React.FC<Props> = ({ route }) => {
    const { federationId = '' } = route.params

    const ourPaymentAddress = useSpv2OurPaymentAddress(fedimint, federationId)

    return (
        <SafeScrollArea edges="notop">
            <Column grow fullWidth>
                {ourPaymentAddress ? (
                    <ReceiveQr
                        title={
                            <StabilityWalletTitle
                                federationId={federationId}
                                bolder
                                showCurrency={false}
                            />
                        }
                        uri={{
                            // TODO: implement deep linking.
                            // Deeplinking code is a disgusting rats nest of AI slop.
                            // I'd prefer if we burn it down & fix it before adding
                            // additional logic / codes.
                            //
                            // fullString: `fedi://stable/${ourPaymentAddress}`,
                            fullString: ourPaymentAddress,
                            body: ourPaymentAddress,
                        }}
                        federationId={federationId}
                    />
                ) : null}
            </Column>
        </SafeScrollArea>
    )
}

export default ReceiveStabilityQr
