import { fetchPublicFederations } from '@fedi/common/utils/FederationUtils'

import nightlyFeed from '../../../public/meta-federations-nightly.json'
import { nightlyFederationInvite } from '../../utils/federations'

const e2eFederations = ['Fedi Testnet', 'E-Cash Club', 'Bitcoin Principles']

describe('nightly federations meta', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('should expose the e2e destinations through the Discover consumer', async () => {
        jest.spyOn(global, 'fetch').mockResolvedValue({
            json: async () => nightlyFeed,
        } as Response)

        const cards = await fetchPublicFederations()
        for (const name of e2eFederations) {
            const matches = cards.filter(card => card.name === name)
            expect(matches).toHaveLength(1)
            expect(matches[0].meta.invite_code).toBe(
                nightlyFederationInvite(name),
            )
            expect(matches[0].meta.invite_code).toMatch(/^fed1/)
        }
        expect(new Set(cards.map(card => card.id)).size).toBe(cards.length)
        expect(new Set(cards.map(card => card.meta.invite_code)).size).toBe(
            cards.length,
        )
    })

    it('should report a missing nightly invite', () => {
        expect(() => nightlyFederationInvite('Missing Federation')).toThrow(
            'no "Missing Federation" invite in meta-federations-nightly.json',
        )
    })
})
