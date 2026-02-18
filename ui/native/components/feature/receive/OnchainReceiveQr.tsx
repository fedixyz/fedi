import { useNavigation } from '@react-navigation/native'
import {
    useState,
    useCallback,
    Dispatch,
    SetStateAction,
    useEffect,
} from 'react'
import { useTranslation } from 'react-i18next'

import { useMakeOnchainAddress } from '@fedi/common/hooks/receive'
import { useToast } from '@fedi/common/hooks/toast'

import { reset } from '../../../state/navigation'
import { BitcoinOrLightning, BtcLnUri } from '../../../types'
import { Column } from '../../ui/Flex'
import NotesInput from '../../ui/NotesInput'
import PaymentType from '../send/PaymentType'
import OnchainDepositInfo from './OnchainDepositInfo'
import ReceiveQr from './ReceiveQr'

export default function OnchainReceiveQr({
    federationId,
    generatedOnchainAddress,
    setGeneratedOnchainAddress,
}: {
    federationId?: string
    generatedOnchainAddress: string | null
    setGeneratedOnchainAddress: Dispatch<SetStateAction<string | null>>
}) {
    const [notes, setNotes] = useState('')

    const navigation = useNavigation()
    const toast = useToast()

    const { t } = useTranslation()
    const { isAddressLoading, makeOnchainAddress, onSaveNotes } =
        useMakeOnchainAddress({
            federationId,
            onMempoolTransaction(tx) {
                navigation.dispatch(
                    reset('ReceiveSuccess', {
                        tx,
                    }),
                )
            },
        })

    const handleSaveNotes = useCallback(() => {
        onSaveNotes(notes).catch(e => toast.error(t, e))
    }, [onSaveNotes, notes, toast, t])

    useEffect(() => {
        if (generatedOnchainAddress) return

        makeOnchainAddress()
            .then(setGeneratedOnchainAddress)
            .catch(e => toast.error(t, e))
    }, [
        generatedOnchainAddress,
        setGeneratedOnchainAddress,
        makeOnchainAddress,
        toast,
        t,
    ])

    const uri = new BtcLnUri({
        type: BitcoinOrLightning.bitcoin,
        body: generatedOnchainAddress ?? '',
    })

    return (
        <Column grow gap="xl">
            <PaymentType type="onchain" />
            <ReceiveQr
                uri={uri}
                isLoading={isAddressLoading || !generatedOnchainAddress}>
                <NotesInput
                    notes={notes}
                    setNotes={setNotes}
                    onSave={handleSaveNotes}
                />
                {federationId && (
                    <OnchainDepositInfo federationId={federationId} />
                )}
            </ReceiveQr>
        </Column>
    )
}
