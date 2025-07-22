import { createContext } from 'react'

export const InstallPromptContext = createContext<
    BeforeInstallPromptEvent | undefined
>(undefined)

export const InstallPromptProvider = InstallPromptContext.Provider
