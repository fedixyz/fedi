import * as chat from '../../../utils/chat'

describe('chat', () => {
    describe('generateRandomDisplayName', () => {
        describe('When the function is called', () => {
            it('should return a random display name containing two words', () => {
                const displayName = chat.generateRandomDisplayName()
                const words = displayName.split(' ')

                expect(words.length).toBe(2)
            })
        })
    })
})
