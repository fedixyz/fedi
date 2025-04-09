import { useEffect, useState } from 'react'

export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(false)

    useEffect(() => {
        const media = window.matchMedia(query)
        setMatches(media.matches)
        const listener = () => setMatches(media.matches)
        media.addEventListener('change', listener)
        return () => media.removeEventListener('change', listener)
    }, [matches, query])

    return matches
}

export function useCopy() {
    const [copied, setCopied] = useState<boolean>(false)

    const copy = async (value: string) => {
        try {
            await navigator.clipboard.writeText(value)
            setCopied(true)

            setTimeout(() => {
                setCopied(false)
            }, 2000) // 2 second delay
        } catch {
            setCopied(false)
        }
    }

    return { copy, copied }
}
