import {
    FA_FORMATION_PUSH_ROUTE,
    parseFaFormationPushRoute,
} from '../../../utils/faPush'
import routeFixture from '../../fixtures/fiFormationPushRoute.json'

describe('FA formation push routing contract', () => {
    test('matches the shared Rust producer contract fixture', () => {
        expect(FA_FORMATION_PUSH_ROUTE).toEqual(routeFixture)
        expect(parseFaFormationPushRoute(routeFixture)).toBe(
            FA_FORMATION_PUSH_ROUTE,
        )
    })

    test('recognizes the exact route and ignores non-routing gateway fields', () => {
        expect(
            parseFaFormationPushRoute({
                ...FA_FORMATION_PUSH_ROUTE,
                recipient_id: 'recipient',
                notification_id: 'notification',
            }),
        ).toBe(FA_FORMATION_PUSH_ROUTE)
    })

    test.each([
        null,
        [],
        {},
        { ...FA_FORMATION_PUSH_ROUTE, kind: 'payment_complete' },
        { ...FA_FORMATION_PUSH_ROUTE, 'pg.open_behavior': 'open_deep_link' },
        { ...FA_FORMATION_PUSH_ROUTE, 'pg.workflow': 'other_workflow' },
        { ...FA_FORMATION_PUSH_ROUTE, 'pg.action': 'formed' },
        { ...FA_FORMATION_PUSH_ROUTE, 'pg.privacy': 'data_only' },
    ])('rejects a missing or mismatched route: %p', value => {
        expect(parseFaFormationPushRoute(value)).toBeNull()
    })
})
