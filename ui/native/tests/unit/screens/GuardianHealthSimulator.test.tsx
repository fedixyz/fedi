import {
    act,
    cleanup,
    fireEvent,
    screen,
    waitFor,
} from '@testing-library/react-native'

import {
    removeFederations,
    setAppFlavor,
    setDeveloperMode,
    setFederations,
    setGuardianHealthSimulation,
    setupStore,
} from '@fedi/common/redux'
import {
    mockFederation1,
    mockFederation2,
} from '@fedi/common/tests/mock-data/federation'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import type { GuardianStatus } from '@fedi/common/types/bindings'
import * as environment from '@fedi/common/utils/environment'
import { transformStateToStorage } from '@fedi/common/utils/storage'

import FederationDetailStats from '../../../components/feature/federations/FederationDetailStats'
import FederationStatus from '../../../components/feature/federations/FederationStatus'
import i18n from '../../../localization/i18n'
import GuardianHealthSimulator from '../../../screens/developer/GuardianHealthSimulator'
import { renderWithProviders } from '../../utils/render'

const federation = {
    ...mockFederation1,
    nodes: Object.fromEntries(
        Array.from({ length: 10 }, (_, index) => [
            index,
            {
                name: `Guardian ${index + 1}`,
                url: `wss://guardian-${index}.example`,
            },
        ]),
    ),
}
const guardians: GuardianStatus[] = Object.values(federation.nodes).map(
    node => ({
        online: { guardian: node.url, latency_ms: 10 },
    }),
)

describe('guardian simulation with live bridge observations', () => {
    const previousBuild = process.env.FEDI_ENV
    const previousWebBuild = process.env.NEXT_PUBLIC_FEDI_ENV

    beforeEach(() => {
        jest.spyOn(environment, 'isDev').mockReturnValue(false)
        process.env.FEDI_ENV = 'nightly'
        delete process.env.NEXT_PUBLIC_FEDI_ENV
    })

    afterEach(() => {
        cleanup()
        jest.restoreAllMocks()
        if (previousBuild === undefined) delete process.env.FEDI_ENV
        else process.env.FEDI_ENV = previousBuild
        if (previousWebBuild === undefined)
            delete process.env.NEXT_PUBLIC_FEDI_ENV
        else process.env.NEXT_PUBLIC_FEDI_ENV = previousWebBuild
    })

    const renderFlow = (appFlavor?: 'bravo' | 'nightly') => {
        const store = setupStore()
        if (appFlavor) store.dispatch(setAppFlavor(appFlavor))
        store.dispatch(setFederations([federation, mockFederation2]))
        const fedimint = createMockFedimintBridge({
            getGuardianStatus: async () => guardians,
        })
        renderWithProviders(
            <>
                <GuardianHealthSimulator federation={federation} />
                <FederationDetailStats federation={federation} />
                <FederationStatus federationId={federation.id} />
            </>,
            { store, fedimint },
        )
        return { store, fedimint }
    }

    it('changes rendered counts and warnings without replacing live wallet data', async () => {
        const { store, fedimint } = renderFlow()
        await waitFor(() => expect(screen.getByText('10/10')).toBeOnTheScreen())
        const live = store.getState().federation
        expect(live.guardianHealth[federation.id]?.guardians).toEqual(guardians)
        const persisted = transformStateToStorage(store.getState())

        fireEvent(
            screen.getByLabelText('Simulate guardian connections'),
            'valueChange',
            true,
        )
        fireEvent(
            screen.getByLabelText('Guardian 1 online'),
            'valueChange',
            false,
        )
        expect(screen.getByText('9/10')).toBeOnTheScreen()
        expect(
            screen.getByText(
                i18n.t('feature.federations.guardian-connection-limited'),
            ),
        ).toBeOnTheScreen()

        for (const index of [2, 3, 4])
            fireEvent(
                screen.getByLabelText(`Guardian ${index} online`),
                'valueChange',
                false,
            )
        expect(screen.getByText('6/10')).toBeOnTheScreen()
        expect(screen.getByText(i18n.t('words.offline'))).toBeOnTheScreen()

        fireEvent.press(screen.getByText('Just changed'))
        expect(
            screen.getByText(i18n.t('feature.federations.last-known-status')),
        ).toBeOnTheScreen()
        fireEvent.press(screen.getByText('No result'))
        expect(screen.getByText('--/--')).toBeOnTheScreen()
        expect(screen.getByText(i18n.t('words.unknown'))).toBeOnTheScreen()

        const simulated = store.getState().federation
        expect(simulated.federations).toBe(live.federations)
        expect(simulated.guardianHealth).toBe(live.guardianHealth)
        expect(simulated.guardianStatusRequests).toBe(
            live.guardianStatusRequests,
        )
        expect(
            simulated.guardianHealthSimulation[mockFederation2.id],
        ).toBeUndefined()
        expect(transformStateToStorage(store.getState())).toEqual(persisted)
        expect(fedimint.getGuardianStatus).toHaveBeenCalledTimes(1)

        fireEvent(
            screen.getByLabelText('Simulate guardian connections'),
            'valueChange',
            false,
        )
        expect(screen.getByText('10/10')).toBeOnTheScreen()
        expect(
            screen.getByText(
                i18n.t('feature.federations.guardian-connection-online'),
            ),
        ).toBeOnTheScreen()
        fireEvent(
            screen.getByLabelText('Simulate guardian connections'),
            'valueChange',
            true,
        )
        act(() => store.dispatch(removeFederations([federation.id])))
        expect(store.getState().federation.guardianHealthSimulation).toEqual({})
    })

    it.each(['bravo', 'nova'])(
        'ignores an injected override in a %s release build',
        async build => {
            process.env.FEDI_ENV = build
            const { store } = renderFlow(
                build === 'bravo' ? 'bravo' : 'nightly',
            )
            await waitFor(() =>
                expect(screen.getByText('10/10')).toBeOnTheScreen(),
            )
            act(() => {
                store.dispatch(setDeveloperMode(true))
                store.dispatch(
                    setGuardianHealthSimulation({
                        federationId: federation.id,
                        simulation: { mode: 'unknown', guardians: [] },
                    }),
                )
            })
            expect(
                screen.queryByLabelText('Simulate guardian connections'),
            ).toBeNull()
            expect(screen.getByText('10/10')).toBeOnTheScreen()
            expect(
                screen.getByText(
                    i18n.t('feature.federations.guardian-connection-online'),
                ),
            ).toBeOnTheScreen()
        },
    )
})
