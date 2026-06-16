import { nightlyFederationInvite } from '../../utils/federations'

// Guards the federation that the join-community-then-federation e2e deep-links
// into. If the entry is renamed or removed from the nightly meta, that e2e
// breaks; this fails first and points at why.
describe('nightly federations meta', () => {
    it('keeps the Fedi Testnet entry the deep-link e2e relies on', () => {
        expect(nightlyFederationInvite('Fedi Testnet')).toMatch(/^fed1/)
    })
})
