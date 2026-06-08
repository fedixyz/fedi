import { useState } from 'react'

import { Federation } from '../../types'
import { useDepositForm } from './useDepositForm'

/**
 * Adds submit state and validation to the base stability pool deposit form.
 */
export function useStabilityDepositForm(federationId: Federation['id']) {
    const depositForm = useDepositForm(federationId)
    const [submitAttempts, setSubmitAttempts] = useState(0)

    const { inputAmount, minimumAmount, maximumAmount } = depositForm
    const isValidAmount =
        (minimumAmount === 0
            ? inputAmount > minimumAmount
            : inputAmount >= minimumAmount) && inputAmount <= maximumAmount

    return {
        ...depositForm,
        submitAttempts,
        setSubmitAttempts,
        isValidAmount,
    }
}
