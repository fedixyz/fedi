import { useRouter } from 'next/router'
import React, { useEffect } from 'react'

interface Props {
    path: string
}

export const Redirect: React.FC<Props> = ({ path }) => {
    const { replace, pathname } = useRouter()

    useEffect(() => {
        if (pathname !== path) {
            replace(path)
        }
    }, [path, pathname, replace])

    // Render nothing while the redirect kicks in
    return null
}
