import React, { createContext } from 'react'

import { FedimintBridge } from '../utils/fedimint'

export const FedimintContext = createContext<FedimintBridge | null>(null)

interface FedimintProviderProps {
    children: React.ReactNode
    fedimint: FedimintBridge
}

export function FedimintProvider({
    children,
    fedimint,
}: FedimintProviderProps) {
    return (
        <FedimintContext.Provider value={fedimint}>
            {children}
        </FedimintContext.Provider>
    )
}
