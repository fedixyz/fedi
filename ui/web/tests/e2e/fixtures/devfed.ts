// Host-side controls for the local devimint federation the payment specs fund
// from. Chromium shares the host loopback with the fed, so the browser reaches
// the guardians with no port forwarding.
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

async function runLightningClient(
    args: string[],
    signal?: AbortSignal,
): Promise<unknown> {
    const directory = process.env.FM_CLIENT_DIR
    if (!devfedAvailable() || !directory) {
        throw new Error('Lightning payment tests require --with-devfed')
    }
    const lightningModule =
        process.env.FEDI_FEDERATION_KIND === 'two' ? 'lnv2' : 'ln'
    const { stdout } = await execFileAsync(
        'fedimint-cli',
        ['--data-dir', directory, 'module', lightningModule, ...args],
        { encoding: 'utf8', timeout: 120000, signal },
    )
    return JSON.parse(stdout)
}

export async function generateDevfedInvoice(msats: number): Promise<{
    invoice: string
    operationId: string
}> {
    if (process.env.FEDI_FEDERATION_KIND === 'two') {
        const gatewayPort = process.env.FM_PORT_GW_LND
        if (!gatewayPort || !/^\d+$/.test(gatewayPort)) {
            throw new Error('The funded LND gateway port is unavailable')
        }
        // DevFed waits for LND's ecash deposit. Its other registered gateways
        // can still have no spendable ecash when an invoice is requested.
        const [invoice, operationId] = (await runLightningClient([
            'receive',
            String(msats),
            '--gateway',
            `http://127.0.0.1:${gatewayPort}/`,
        ])) as [string, string]
        return { invoice, operationId }
    }
    const { invoice, operation_id: operationId } = (await runLightningClient([
        'invoice',
        String(msats),
    ])) as { invoice: string; operation_id: string }
    return { invoice, operationId }
}

export async function awaitDevfedInvoice(
    operationId: string,
    signal: AbortSignal,
): Promise<void> {
    const kindTwo = process.env.FEDI_FEDERATION_KIND === 'two'
    const result = await runLightningClient(
        [kindTwo ? 'await-receive' : 'await-invoice', operationId],
        signal,
    )
    const claimed = kindTwo
        ? result === 'Claimed'
        : (result as { status: string }).status === 'paid'
    if (!claimed) {
        throw new Error(
            `Lightning recipient did not claim payment: ${JSON.stringify(result)}`,
        )
    }
}

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
