import {
    FI_FORMATION_PUSH_ROUTE,
    parseFiFormationPushRoute,
} from '../../../utils/fiPush'
import routeFixture from '../../fixtures/fiFormationPushRoute.json'

describe('FI formation push routing contract', () => {
    test('matches the shared Rust producer contract fixture', () => {
        expect(FI_FORMATION_PUSH_ROUTE).toEqual(routeFixture)
        expect(parseFiFormationPushRoute(routeFixture)).toBe(
            FI_FORMATION_PUSH_ROUTE,
        )
    })

    test('recognizes the exact route and ignores non-routing gateway fields', () => {
        expect(
            parseFiFormationPushRoute({
                ...FI_FORMATION_PUSH_ROUTE,
                recipient_id: 'recipient',
                notification_id: 'notification',
            }),
        ).toBe(FI_FORMATION_PUSH_ROUTE)
    })

    test.each([
        null,
        [],
        {},
        { ...FI_FORMATION_PUSH_ROUTE, kind: 'payment_complete' },
        { ...FI_FORMATION_PUSH_ROUTE, 'pg.open_behavior': 'open_deep_link' },
        { ...FI_FORMATION_PUSH_ROUTE, 'pg.workflow': 'other_workflow' },
        { ...FI_FORMATION_PUSH_ROUTE, 'pg.action': 'formed' },
        { ...FI_FORMATION_PUSH_ROUTE, 'pg.privacy': 'data_only' },
    ])('rejects a missing or mismatched route: %p', value => {
        expect(parseFiFormationPushRoute(value)).toBeNull()
    })
})
