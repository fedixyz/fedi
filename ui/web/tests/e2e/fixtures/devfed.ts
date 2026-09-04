// Host-side controls for the local devimint federation the payment specs fund
// from. Chromium shares the host loopback with the fed, so the browser reaches
// the guardians with no port forwarding.

function baseUrl(): string {
    const port = process.env.REMOTE_BRIDGE_PORT
    if (!port) {
        throw new Error(
            'REMOTE_BRIDGE_PORT is unset; run scripts/ui/run-e2e-web.sh --with-devfed',
        )
    }
    return `http://127.0.0.1:${port}`
}

export function devfedAvailable(): boolean {
    return !!process.env.REMOTE_BRIDGE_PORT
}

// The fed is a freshly launched local process, so the first calls can race a
// connection reset before it settles.
async function fetchJson(path: string): Promise<Record<string, string>> {
    let lastErr: unknown
    for (let attempt = 1; attempt <= 5; attempt++) {
        try {
            const res = await fetch(`${baseUrl()}${path}`)
            const body = await res.text()
            if (!res.ok) throw new Error(`${path} ${res.status}: ${body}`)
            return JSON.parse(body)
        } catch (err) {
            lastErr = err
            if (attempt < 5)
                await new Promise(r => setTimeout(r, attempt * 500))
        }
    }
    throw new Error(
        `dev fed GET ${path} failed after 5 attempts: ${(lastErr as Error).message}`,
    )
}

export async function getDevfedInvite(): Promise<string> {
    const { invite_code: invite } = await fetchJson('/invite_code')
    if (!invite) throw new Error('invite_code response carried no invite')
    return invite
}

export async function generateDevfedEcash(msats: number): Promise<string> {
    const { ecash } = await fetchJson(`/generate_ecash/${msats}`)
    if (!ecash) throw new Error('generate_ecash response carried no ecash')
    return ecash
}
