import { spawnSync } from 'child_process'

export const ONCHAIN_TEST_ADDRESS = 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn'

function runClient(args: string[]): unknown {
    const directory = process.env.FM_CLIENT_DIR
    if (!process.env.REMOTE_BRIDGE_PORT || !directory) {
        throw new Error('On-chain amount tests require --with-devfed')
    }
    const result = spawnSync(
        'fedimint-cli',
        ['--data-dir', directory, ...args],
        {
            encoding: 'utf8',
            timeout: 120000,
        },
    )
    if (result.error) throw result.error
    if (result.status !== 0) {
        throw new Error(
            `Dev federation client failed: ${result.stdout}\n${result.stderr}`,
        )
    }
    return JSON.parse(result.stdout)
}

export function getOnchainTestFederation(): {
    kind: 'one' | 'two'
    minimum: number
} {
    const kind = process.env.FEDI_FEDERATION_KIND === 'two' ? 'two' : 'one'
    const modules = runClient(['module']) as { list: { kind: string }[] }
    const wallet = kind === 'two' ? 'walletv2' : 'wallet'
    const otherWallet = kind === 'two' ? 'wallet' : 'walletv2'
    if (
        !modules.list.some(module => module.kind === wallet) ||
        modules.list.some(module => module.kind === otherWallet)
    ) {
        throw new Error(`Expected a pure ${wallet} federation`)
    }
    return { kind, minimum: kind === 'two' ? 10000 : 546 }
}

export function generateOnchainTestEcash(
    sats: number,
    mode: 'exact' | 'atLeast' = 'exact',
): string {
    const amount = String(sats * 1000)
    if (process.env.FEDI_FEDERATION_KIND === 'two') {
        return readEcash(runClient(['module', 'mintv2', 'send', amount]))
    }
    for (let attempt = 0; ; attempt++) {
        try {
            return readEcash(
                runClient([
                    'module',
                    'mint',
                    'spend',
                    ...(mode === 'atLeast' ? ['--allow-overpay'] : []),
                    amount,
                ]),
            )
        } catch (error) {
            if (
                attempt >= 3 ||
                mode !== 'exact' ||
                !String(error).includes(
                    'Could not select notes with exact amount',
                )
            ) {
                throw error
            }
            process.stdout.write(
                `[payments:funding] reissuing notes for exact ${sats}-sat funding\n`,
            )
            const notes = readEcash(
                runClient([
                    'module',
                    'mint',
                    'spend',
                    '--allow-overpay',
                    amount,
                ]),
            )
            runClient(['module', 'mint', 'reissue', notes])
        }
    }
}

function readEcash(result: unknown): string {
    const ecash =
        typeof result === 'string'
            ? result
            : (result as { notes?: string }).notes
    if (!ecash) throw new Error('Dev federation did not return ecash')
    return ecash
}
