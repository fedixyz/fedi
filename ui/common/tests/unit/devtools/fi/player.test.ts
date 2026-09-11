import { FiPlayer, PlayerHost } from '../../../../devtools/fi/player'
import { IDLE_STATUS } from '../../../../devtools/fi/status'
import {
    awaitRpc,
    checkpoint,
    checkpointsOf,
    emit,
    formWalletService,
    reply,
    script,
    stream,
    wait,
} from '../../../../devtools/fi/steps'
import type { RpcFiStatus } from '../../../../types/bindings'

const formation = (
    formationId: string,
    phase: 'preparing' | 'formed',
): RpcFiStatus =>
    ({
        type: 'formation',
        formation: { formationId, phase },
    }) as unknown as RpcFiStatus

const makeHost = () => {
    const waiters = new Map<
        string,
        (payload: Record<string, unknown>) => void
    >()
    let ids = 0
    const host: PlayerHost & {
        statuses: RpcFiStatus[]
        events: Array<[string, unknown]>
        replies: Array<[string, unknown]>
        formed: string[]
        callRpc: (method: string, payload: Record<string, unknown>) => void
    } = {
        statuses: [],
        events: [],
        replies: [],
        formed: [],
        setStatus: jest.fn(status => host.statuses.push(status)),
        emitEvent: jest.fn((event, payload) =>
            host.events.push([event, payload]),
        ),
        setReply: jest.fn((method, value) =>
            host.replies.push([method, value]),
        ),
        onRpc: jest.fn(
            method =>
                new Promise<Record<string, unknown>>(resolve => {
                    waiters.set(method, resolve)
                }),
        ),
        formWalletService: jest.fn(join => host.formed.push(join)),
        nextFormationId: jest.fn(() => `formation_${++ids}`),
        callRpc: (method, payload) => waiters.get(method)?.(payload),
    }
    return host
}

const SCRIPT = script('test', [
    reply('fiClientEligiblePayers', { type: 'payers', payers: [] }),
    awaitRpc('fiClientPayAndCreate', { previewId: 'p1' }),
    checkpoint('paid'),
    stream(ctx => formation(ctx.formationId, 'preparing')),
    wait(2_000),
    checkpoint('preparing'),
    emit('balance', { federationId: 'f', balance: 1 }),
    wait(3_000),
    formWalletService('ready'),
    stream(ctx => formation(ctx.formationId, 'formed')),
    checkpoint('formed'),
])

describe('FiPlayer', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('should list checkpoints in script order', () => {
        expect(checkpointsOf(SCRIPT)).toEqual(['paid', 'preparing', 'formed'])
    })

    it('should publish idle first and use a fresh formation id per run', async () => {
        const host = makeHost()
        const player = new FiPlayer(host)

        const run = player.run(SCRIPT, { jumpTo: 'preparing' })
        await jest.advanceTimersByTimeAsync(0)

        expect(host.statuses[0]).toEqual(IDLE_STATUS)
        expect(host.statuses[1]).toEqual(formation('formation_1', 'preparing'))
        player.cancel()
        await run
    })

    it('should land on the checkpoint with no timers left and answer awaited rpcs from the recording', async () => {
        const host = makeHost()
        const player = new FiPlayer(host)

        const run = player.run(SCRIPT, { jumpTo: 'preparing' })
        await jest.advanceTimersByTimeAsync(0)

        expect(host.onRpc).not.toHaveBeenCalled()
        expect(host.replies).toEqual([
            ['fiClientEligiblePayers', { type: 'payers', payers: [] }],
        ])
        expect(player.current).toEqual({
            script: 'test',
            checkpoint: 'preparing',
        })
        expect(jest.getTimerCount()).toBe(1) // only the real wait(3_000) after the checkpoint
        player.cancel()
        await run
    })

    it('should keep real timing after the checkpoint', async () => {
        const host = makeHost()
        const player = new FiPlayer(host)

        const run = player.run(SCRIPT, { jumpTo: 'preparing' })
        await jest.advanceTimersByTimeAsync(0)
        expect(host.events).toEqual([
            ['balance', { federationId: 'f', balance: 1 }],
        ])
        expect(host.formed).toEqual([])

        await jest.advanceTimersByTimeAsync(3_000)
        await run

        expect(host.formed).toEqual(['ready'])
        expect(host.statuses.at(-1)).toEqual(formation('formation_1', 'formed'))
        expect(player.current).toEqual({ script: 'test', checkpoint: 'formed' })
        expect(jest.getTimerCount()).toBe(0)
    })

    it('should block on awaitRpc when playing from the start', async () => {
        const host = makeHost()
        const player = new FiPlayer(host)

        const run = player.run(SCRIPT)
        await jest.advanceTimersByTimeAsync(0)

        expect(host.onRpc).toHaveBeenCalledWith('fiClientPayAndCreate')
        expect(host.statuses).toEqual([IDLE_STATUS])

        host.callRpc('fiClientPayAndCreate', { previewId: 'real' })
        await jest.advanceTimersByTimeAsync(0)

        expect(host.statuses[1]).toEqual(formation('formation_1', 'preparing'))
        player.cancel()
        await run
    })

    it('should expose the recorded payload for a jumped awaitRpc', async () => {
        const host = makeHost()
        const seen: unknown[] = []
        const player = new FiPlayer(host)
        const recordingScript = script('rec', [
            awaitRpc('fiClientPayAndCreate', { previewId: 'p1' }),
            checkpoint('paid'),
            reply('fiClientStatus', ctx => {
                seen.push(ctx.recorded.fiClientPayAndCreate)
                return null
            }),
        ])

        await player.run(recordingScript, { jumpTo: 'paid' })

        expect(seen).toEqual([{ previewId: 'p1' }])
    })

    it('should stop a running script on cancel and on the next run', async () => {
        const host = makeHost()
        const player = new FiPlayer(host)

        const first = player.run(SCRIPT, { jumpTo: 'preparing' })
        await jest.advanceTimersByTimeAsync(0)
        const second = player.run(SCRIPT, { jumpTo: 'paid' })
        await first
        // cancel the second run too, before its own post-checkpoint wait(2_000)
        // can fire, so the advance below only proves no timer survives either run
        player.cancel()
        await second
        await jest.advanceTimersByTimeAsync(10_000)

        expect(host.formed).toEqual([])
        expect(player.current).toEqual({ script: 'test', checkpoint: 'paid' })
        expect(jest.getTimerCount()).toBe(0)
    })

    it('should release a run parked on awaitRpc when cancelled', async () => {
        const host = makeHost()
        const player = new FiPlayer(host)

        const run = player.run(SCRIPT)
        await jest.advanceTimersByTimeAsync(0)
        expect(host.onRpc).toHaveBeenCalledWith('fiClientPayAndCreate')

        player.cancel()
        await run

        expect(host.statuses).toEqual([IDLE_STATUS])
        expect(host.formed).toEqual([])
        expect(player.current).toEqual({ script: 'test', checkpoint: null })
        expect(jest.getTimerCount()).toBe(0)
    })

    it('should reject an unknown checkpoint before touching the host', async () => {
        const host = makeHost()
        const player = new FiPlayer(host)

        await expect(player.run(SCRIPT, { jumpTo: 'nope' })).rejects.toThrow(
            'unknown checkpoint "nope" in script "test"',
        )
        expect(host.setStatus).not.toHaveBeenCalled()
    })
})
