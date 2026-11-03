import { mostRelevantReason } from '../../../../../components/feature/walletservice/replacementReasons'

describe('mostRelevantReason', () => {
    it('should put an uptime score before missed sessions and the last time seen', () => {
        expect(
            mostRelevantReason([
                { type: 'offline', lastSeenSecs: 1_700_000_000 },
                { type: 'missedSessions', sessions: 4 },
                { type: 'lowMonthScore', basisPoints: 8_100 },
                { type: 'lowWeekScore', basisPoints: 6_200 },
            ]),
        ).toEqual({ type: 'lowWeekScore', basisPoints: 6_200 })
    })

    it('should put missed sessions before the last time seen, whatever the order given', () => {
        expect(
            mostRelevantReason([
                { type: 'offline', lastSeenSecs: 1_700_000_000 },
                { type: 'missedSessions', sessions: 14 },
            ]),
        ).toEqual({ type: 'missedSessions', sessions: 14 })
    })

    it('should put a revoked holder above everything', () => {
        expect(
            mostRelevantReason([
                { type: 'lowWeekScore', basisPoints: 100 },
                { type: 'disconnected' },
                { type: 'holderRevoked' },
            ]),
        ).toEqual({ type: 'holderRevoked' })
    })

    it('should show the last time seen when it is the only reason', () => {
        expect(
            mostRelevantReason([{ type: 'offline', lastSeenSecs: 5 }]),
        ).toEqual({ type: 'offline', lastSeenSecs: 5 })
    })

    it('should not reorder the list it was given', () => {
        const reasons = [
            { type: 'offline' as const, lastSeenSecs: 5 },
            { type: 'disconnected' as const },
        ]
        mostRelevantReason(reasons)
        expect(reasons[0].type).toBe('offline')
    })
})
