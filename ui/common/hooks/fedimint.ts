import { useContext } from 'react'

import { FedimintContext } from '../components/FedimintProvider'

export function useFedimint() {
    const fedimint = useContext(FedimintContext)
    if (!fedimint) {
        throw new Error('useFedimint must be used within a FedimintProvider')
    }
    return fedimint
}
