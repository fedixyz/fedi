import { FORMATION_PHASES } from '../../../../devtools/fi/scenarios'
import {
    formationAt,
    formationStatus,
    IDLE_STATUS,
    withError,
    withUnsynced,
} from '../../../../devtools/fi/status'

const SEED = { formationId: 'formation_test' }

describe('formation status builders', () => {
    it('should build a snapshot at the requested phase with seats in the matching seat phase', () => {
        const formation = formationAt(SEED, 'dkgUnderway')

        expect(formation.formationId).toBe('formation_test')
        expect(formation.phase).toBe('dkgUnderway')
        expect(formation.seats).toHaveLength(4)
        expect(
            formation.seats.every(seat => seat.phase === 'dkgUnderway'),
        ).toBe(true)
        expect(formation.freshness).toBe('fresh')
        expect(formation.lastError).toBeNull()
        expect(formation.actionRequired).toBeNull()
    })

    it('should flip milestones on the phases the progress screen ties them to', () => {
        expect(formationAt(SEED, 'preparing').milestones).toEqual({
            ecashSent: false,
            guardiansConfirmed: false,
            walletServiceCreated: false,
        })
        expect(formationAt(SEED, 'acquiringSeats').milestones.ecashSent).toBe(
            true,
        )
        expect(formationAt(SEED, 'acquiringSeats').paymentOutputsStarted).toBe(
            true,
        )
        expect(
            formationAt(SEED, 'dkgUnderway').milestones.guardiansConfirmed,
        ).toBe(true)
        expect(
            formationAt(SEED, 'formed').milestones.walletServiceCreated,
        ).toBe(true)
        expect(formationAt(SEED, 'formed').inviteCode).not.toBeNull()
    })

    it('should honour the seed overrides', () => {
        const formation = formationAt(
            {
                ...SEED,
                federationName: 'Named',
                federationSize: 7,
                seatPriceMsats: 1_000,
            },
            'preparing',
        )

        expect(formation.intent.federationName).toBe('Named')
        expect(formation.intent.federationSize).toBe(7)
        expect(formation.seats).toHaveLength(7)
        expect(formation.intent.maxTotalMsats).toBe(String(7 * 1_000))
    })

    it('should not mutate the input when adding an error or unsynced freshness', () => {
        const formation = formationAt(SEED, 'dkgUnderway')

        const failed = withError(formation, 'fleetManager')
        const stale = withUnsynced(formation)

        expect(failed.lastError).toBe('fleetManager')
        expect(stale.freshness).toBe('unsynced')
        expect(formation.lastError).toBeNull()
        expect(formation.freshness).toBe('fresh')
    })

    it('should wrap a snapshot as a formation status and expose idle', () => {
        const formation = formationAt(SEED, 'preparing')

        expect(formationStatus(formation)).toEqual({
            type: 'formation',
            formation,
        })
        expect(IDLE_STATUS).toEqual({ type: 'idle' })
    })

    it('should accept every phase in the timeline', () => {
        for (const phase of FORMATION_PHASES) {
            expect(formationAt(SEED, phase).phase).toBe(phase)
        }
    })
})
