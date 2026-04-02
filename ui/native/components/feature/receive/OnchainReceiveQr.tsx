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
import OnchainDepositInfo from './OnchainDepositInfo'
import ReceiveQr from './ReceiveQr'

export default function OnchainReceiveQr({
    federationId,
    generatedOnchainAddress,
    setGeneratedOnchainAddress,
}: {
    federationId?: string
    generatedOnchainAddress: { federationId: string; address: string } | null
    setGeneratedOnchainAddress: Dispatch<
        SetStateAction<{ federationId: string; address: string } | null>
    >
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
        if (!federationId) return
        if (generatedOnchainAddress?.federationId === federationId) return

        makeOnchainAddress()
            .then(address => {
                if (!federationId || !address) {
                    setGeneratedOnchainAddress(null)
                    return
                }

                setGeneratedOnchainAddress({
                    federationId,
                    address,
                })
            })
            .catch(e => toast.error(t, e))
    }, [
        generatedOnchainAddress,
        setGeneratedOnchainAddress,
        makeOnchainAddress,
        toast,
        t,
        federationId,
    ])

    const uri = new BtcLnUri({
        type: BitcoinOrLightning.bitcoin,
        body: generatedOnchainAddress?.address ?? '',
    })

    return (
        <Column grow gap="xl">
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
