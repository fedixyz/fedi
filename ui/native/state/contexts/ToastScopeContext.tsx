import React, { createContext, useContext, useState } from 'react'

type ToastScope = 'global' | 'overlay'

type Ctx = {
    scope: ToastScope
    setScope: (scope: ToastScope) => void
}

const ToastScopeContext = createContext<Ctx>({
    scope: 'global',
    setScope: () => {},
})

export const ToastScopeProvider = ({
    children,
}: {
    children: React.ReactNode
}) => {
    const [scope, setScope] = useState<ToastScope>('global')
    return (
        <ToastScopeContext.Provider value={{ scope, setScope }}>
            {children}
        </ToastScopeContext.Provider>
    )
}

export const useToastScope = () => useContext(ToastScopeContext)
