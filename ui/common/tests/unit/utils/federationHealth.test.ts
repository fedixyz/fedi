import { FederationStatus } from '../../../types'
import { GuardianStatus } from '../../../types/bindings'
import {
    FederationHealth,
    observeFederationHealth,
} from '../../../utils/federationHealth'

function guardians(total: number, online: number): GuardianStatus[] {
    return Array.from({ length: total }, (_, i) =>
        i < online
            ? {
                  online: {
                      guardian: `guardian-${i}`,
                      fman_name: null,
                      latency_ms: 5,
                  },
              }
            : {
                  timeout: {
                      guardian: `guardian-${i}`,
                      fman_name: null,
                      elapsed: '10s',
                  },
              },
    )
}

function observationSequence(total: number) {
    let health: FederationHealth | undefined
    let status: FederationStatus = 'unknown'
    return (online: number, seconds: number) => {
        const result = observeFederationHealth(
            guardians(total, online),
            seconds * 1000,
            health,
            status,
        )
        health = result.health
        status = result.status
        return status
    }
}

describe('federation reachability', () => {
    it.each([
        [4, 3],
        [7, 5],
        [10, 7],
        [13, 9],
        [1, 1],
        [2, 2],
        [5, 4],
    ])('uses the Fedimint quorum for %i guardians', (total, quorum) => {
        const observe = observationSequence(total)
        expect(observe(total, 0)).toBe('online')
        for (let seconds = 30; seconds < 210; seconds += 30) {
            expect(observe(quorum - 1, seconds)).toBe('online')
        }
        expect(observe(quorum - 1, 210)).toBe('offline')
        expect(observe(quorum, 240)).toBe(
            total === quorum ? 'online' : 'unstable',
        )
    })

    it('does not show a warning for a brief loss of quorum', () => {
        const observe = observationSequence(10)
        expect(observe(10, 0)).toBe('online')
        expect(observe(4, 35)).toBe('online')
        expect(observe(7, 70)).toBe('online')
        expect(observe(8, 105)).toBe('online')
        expect(observe(9, 140)).toBe('online')
    })

    it.each([7, 8, 9])(
        'warns after six minutes with %i of ten guardians reachable',
        online => {
            const observe = observationSequence(10)
            observe(10, -30)
            for (let seconds = 0; seconds < 360; seconds += 30) {
                expect(observe(online, seconds)).toBe('online')
            }
            expect(observe(online, 360)).toBe('unstable')
            expect(observe(10, 390)).toBe('online')
            expect(observe(7, 420)).toBe('online')
        },
    )

    it('keeps measuring an outage when the count changes below quorum', () => {
        const observe = observationSequence(10)
        for (let seconds = 0; seconds < 180; seconds += 30) {
            expect(observe(seconds % 60 ? 6 : 4, seconds)).toBe('unknown')
        }
        expect(observe(5, 180)).toBe('offline')
    })

    it('does not let brief quorum recovery erase prolonged low redundancy', () => {
        const observe = observationSequence(10)
        for (let seconds = 0; seconds < 360; seconds += 30) observe(6, seconds)
        expect(observe(7, 360)).toBe('unstable')
        expect(observe(6, 390)).toBe('unstable')
        for (let seconds = 420; seconds < 570; seconds += 30)
            observe(6, seconds)
        expect(observe(6, 570)).toBe('offline')
    })

    it('resets the observation window after a long gap or clock reversal', () => {
        const observe = observationSequence(10)
        for (let seconds = 0; seconds <= 180; seconds += 30) observe(4, seconds)
        expect(observe(4, 360)).toBe('unknown')
        expect(observe(4, 10)).toBe('unknown')
    })

    it('reports unknown for an empty result and restarts after a guardian change', () => {
        expect(observeFederationHealth([], 0).status).toBe('unknown')
        const previous = observeFederationHealth(guardians(4, 0), 0).health
        const changed = guardians(4, 0)
        changed[0] = {
            error: {
                guardian: 'replacement',
                fman_name: null,
                error: 'unreachable',
            },
        }
        expect(
            observeFederationHealth(changed, 30_000, previous, 'offline')
                .status,
        ).toBe('unknown')
    })
})
