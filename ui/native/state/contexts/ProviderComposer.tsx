import React from 'react'

interface Props {
    providers: React.ComponentType<{ children: React.ReactNode }>[]
    children: React.ReactNode
}

export default function ProviderComposer(props: Props) {
    const { providers = [], children } = props

    return (
        <>
            {providers.reduceRight((acc, Provider) => {
                return <Provider>{acc}</Provider>
            }, children)}
        </>
    )
}
