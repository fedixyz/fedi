import { useState } from 'react'

import { Federation } from '../../types'
import { useWithdrawForm } from './useWithdrawForm'

/**
 * Adds submit state and validation to the base stability pool withdrawal form.
 */
export function useStabilityWithdrawForm(federationId: Federation['id']) {
    const withdrawForm = useWithdrawForm(federationId)
    const [submitAttempts, setSubmitAttempts] = useState(0)

    const { inputAmount, minimumAmount, maximumAmount } = withdrawForm
    const isValidAmount =
        (minimumAmount === 0
            ? inputAmount > minimumAmount
            : inputAmount >= minimumAmount) && inputAmount <= maximumAmount

    return {
        ...withdrawForm,
        submitAttempts,
        setSubmitAttempts,
        isValidAmount,
    }
}
