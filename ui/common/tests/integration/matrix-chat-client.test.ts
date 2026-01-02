import { wordListFirst, wordListLast } from '../../constants/words'
import { setMatrixDisplayName } from '../../redux'
import { createIntegrationTestBuilder } from '../utils/remote-bridge-setup'

describe('matrix chat client', () => {
    const builder = createIntegrationTestBuilder()

    it('should return the current matrix auth', async () => {
        await builder.withOnboardingCompleted()

        const {
            bridge: { fedimint },
        } = builder.getContext()

        const client = fedimint.getMatrixClient()
        const auth = await client.getInitialAuth()

        expect(auth.userId).toBeTruthy()
        expect(auth.displayName).toBeTruthy()
        expect(auth.deviceId).toBeTruthy()
    })

    it("should assign an auto-generated display name if the user's display name is their npub", async () => {
        await builder.withOnboardingCompleted()

        const {
            store,
            bridge: { fedimint },
        } = builder.getContext()

        const client = fedimint.getMatrixClient()
        const auth = await client.getInitialAuth()

        expect(auth.displayName).toBeTruthy()

        // Initial auto-generated name
        const [first, last] = (auth.displayName as string).split(' ')
        expect(wordListFirst.includes(first)).toBeTruthy()
        expect(wordListLast.includes(last)).toBeTruthy()

        // Change the display name to the user's npub to simulate a new user creation
        const { npub } = await fedimint.getNostrPubkey()
        store.dispatch(setMatrixDisplayName({ fedimint, displayName: npub }))

        // fire off `getInitialAuth` and get a new display name
        const newAuth = await client.getInitialAuth()
        expect(newAuth).not.toEqual(auth.displayName)
        const [newFirst, newLast] = (newAuth.displayName as string).split(' ')
        expect(wordListFirst.includes(newFirst)).toBeTruthy()
        expect(wordListLast.includes(newLast)).toBeTruthy()
    })
})
