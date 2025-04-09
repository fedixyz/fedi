import * as chat from '../../utils/chat'

describe('chat', () => {
    describe('generateRandomDisplayName', () => {
        describe('When a single word display name is required', () => {
            it('should return a single random word from the BIP39 word list', () => {
                const displayName = chat.generateRandomDisplayName(1)
                const words = displayName.split(' ')

                expect(words.length).toBe(1)
            })
        })

        describe('When a multiple word display name is required', () => {
            it('should return multiple random words from the BIP39 word list separated by spaces', () => {
                const displayName = chat.generateRandomDisplayName(2)
                const words = displayName.split(' ')

                expect(words.length).toBe(2)
            })
        })
    })
})
