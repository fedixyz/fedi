import {
    selectCanSimulateGuardianHealth,
    selectGuardianHealthSimulation,
    setAppFlavor,
    setDeveloperMode,
    setFederations,
    setGuardianHealthSimulation,
    setupStore,
} from '../../../redux'
import * as environment from '../../../utils/environment'
import { mockFederation1 } from '../../mock-data/federation'

describe('guardian display simulation', () => {
    let store: ReturnType<typeof setupStore>
    const previousBuild = process.env.FEDI_ENV
    const previousWebBuild = process.env.NEXT_PUBLIC_FEDI_ENV

    beforeEach(() => {
        jest.spyOn(environment, 'isDev').mockReturnValue(false)
        process.env.FEDI_ENV = 'nightly'
        delete process.env.NEXT_PUBLIC_FEDI_ENV
        store = setupStore()
        store.dispatch(setFederations([mockFederation1]))
    })

    afterEach(() => {
        jest.restoreAllMocks()
        if (previousBuild === undefined) delete process.env.FEDI_ENV
        else process.env.FEDI_ENV = previousBuild
        if (previousWebBuild === undefined)
            delete process.env.NEXT_PUBLIC_FEDI_ENV
        else process.env.NEXT_PUBLIC_FEDI_ENV = previousWebBuild
    })

    const simulate = () => {
        store.dispatch(
            setGuardianHealthSimulation({
                federationId: mockFederation1.id,
                simulation: {
                    mode: 'sustained',
                    guardians: [
                        {
                            timeout: {
                                guardian: 'guardian',
                                elapsed: 'simulated',
                            },
                        },
                    ],
                },
            }),
        )
        return selectGuardianHealthSimulation(
            store.getState(),
            mockFederation1.id,
        )
    }

    it.each(['bravo', 'edge', 'nova', 'tests'] as const)(
        'ignores overrides in %s even with developer mode enabled',
        build => {
            process.env.FEDI_ENV = build
            store.dispatch(setAppFlavor('nightly'))
            store.dispatch(setDeveloperMode(true))
            expect(selectCanSimulateGuardianHealth()).toBe(false)
            expect(simulate()).toBeUndefined()
        },
    )

    it('allows a development build without a nightly flavor', () => {
        process.env.FEDI_ENV = 'bravo'
        store.dispatch(setAppFlavor('dev'))
        jest.mocked(environment.isDev).mockReturnValue(true)
        expect(simulate()?.status).toBe('offline')
    })

    it('allows a nightly build before bridge flavor initialization', () => {
        expect(simulate()?.status).toBe('offline')
    })
})
