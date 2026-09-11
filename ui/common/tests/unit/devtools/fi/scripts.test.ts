import { FiPlayer } from '../../../../devtools/fi/player'
import { FI_SCREEN_GROUPS, findFiScreen } from '../../../../devtools/fi/screens'
import { FORMATION_SCRIPTS } from '../../../../devtools/fi/scripts/formation'
import { FiSimulator } from '../../../../devtools/fi/simulator'
import { checkpointsOf } from '../../../../devtools/fi/steps'
import type {
    RpcFiClientStatus,
    RpcFiFormationSnapshot,
} from '../../../../types/bindings'

const formationOf = (status: RpcFiClientStatus): RpcFiFormationSnapshot => {
    if (status.type !== 'ready' || status.status.type !== 'formation')
        throw new Error(`not a formation: ${JSON.stringify(status)}`)
    return status.status.formation
}

// optional `session` lets a test reuse one simulator/player pair across
// jumps, e.g. to prove the player's formation id keeps advancing rather than
// resetting with a fresh simulator every time
const jumpAndRead = async (
    screenId: string,
    session?: { simulator: FiSimulator; player: FiPlayer },
) => {
    const screen = findFiScreen(screenId)
    if (!screen) throw new Error(`no screen ${screenId}`)
    const simulator = session?.simulator ?? new FiSimulator()
    if (!session)
        simulator.attach(
            () => {},
            () => {},
        )
    const player = session?.player ?? new FiPlayer(simulator)
    const run = player.run(screen.script, { jumpTo: screen.checkpoint })
    await jest.advanceTimersByTimeAsync(0)
    const status = (await simulator.handle(
        'fiClientStatus',
        {},
    )) as RpcFiClientStatus
    player.cancel()
    await run
    return { screen, simulator, status }
}

describe('formation scripts', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('should give every script at least one checkpoint and unique checkpoint names', () => {
        for (const script of FORMATION_SCRIPTS) {
            const names = checkpointsOf(script)
            expect(names.length).toBeGreaterThan(0)
            expect(new Set(names).size).toBe(names.length)
        }
    })

    it('should point every screen at a checkpoint its script defines', () => {
        for (const group of FI_SCREEN_GROUPS) {
            for (const screen of group.screens) {
                expect(checkpointsOf(screen.script)).toContain(
                    screen.checkpoint,
                )
                expect(findFiScreen(screen.id)).toBe(screen)
            }
        }
    })

    it('should have unique screen ids across groups', () => {
        const ids = FI_SCREEN_GROUPS.flatMap(g => g.screens.map(s => s.id))
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('should land each formation phase screen on its phase', async () => {
        for (const phase of [
            'acquiringSeats',
            'dkgUnderway',
            'publishingSeatBindings',
        ] as const) {
            const { status } = await jumpAndRead(`formation.${phase}`)
            expect(formationOf(status).phase).toBe(phase)
            expect(formationOf(status).lastError).toBeNull()
        }
    })

    it('should land the retrying screen on a non-terminal error', async () => {
        const { status } = await jumpAndRead('formation.retrying')
        expect(formationOf(status).phase).toBe('dkgUnderway')
        expect(formationOf(status).lastError).toBe('fleetManager')
    })

    it('should land the terminal failure screen on a terminal error', async () => {
        const { status } = await jumpAndRead('formation.failedTerminally')
        expect(formationOf(status).lastError).toBe('invalidIntent')
    })

    it('should land the reconnecting screen on unsynced freshness', async () => {
        const { status } = await jumpAndRead('formation.reconnecting')
        expect(formationOf(status).freshness).toBe('unsynced')
        expect(formationOf(status).phase).toBe('formed')
    })

    it('should land the formed screen with a joined wallet service', async () => {
        const { status, simulator } = await jumpAndRead('formation.formed')
        expect(formationOf(status).phase).toBe('formed')
        expect(simulator.listMockFederations().map(f => f.id)).toContain(
            `mock-wallet-service-${formationOf(status).formationId}`,
        )
    })

    it('should land the join-failed screen with a failed join and no wallet in the list', async () => {
        const { status, simulator } = await jumpAndRead('formation.joinFailed')
        expect(formationOf(status).phase).toBe('formed')
        expect(simulator.listMockFederations().map(f => f.id)).not.toContain(
            `mock-wallet-service-${formationOf(status).formationId}`,
        )
    })

    it('should use a fresh formation id on every jump', async () => {
        const simulator = new FiSimulator()
        simulator.attach(
            () => {},
            () => {},
        )
        const session = { simulator, player: new FiPlayer(simulator) }
        const first = await jumpAndRead('formation.dkgUnderway', session)
        const second = await jumpAndRead('formation.dkgUnderway', session)
        expect(formationOf(first.status).formationId).not.toBe(
            formationOf(second.status).formationId,
        )
    })
})
