import * as linking from '../../../utils/linking'

describe('common/utils/linking', () => {
    describe('isDeepLink', () => {
        describe('when a url is passed without a link pathname', () => {
            it('should return false', () => {
                const url = 'https://app.fedi.xyz'
                expect(linking.isDeepLink(url)).toBe(false)
            })
        })

        describe('when a url is passed without a screen parameter', () => {
            it('should return false', () => {
                const url = 'https://app.fedi.xyz/link'
                expect(linking.isDeepLink(url)).toBe(false)
            })
        })

        describe('when a url is passed with a screen parameter', () => {
            it('should return true', () => {
                const url = 'https://app.fedi.xyz/link?screen=chat'
                expect(linking.isDeepLink(url)).toBe(true)
            })
        })

        describe('when a url is passed with a screen parameter and # delimiter', () => {
            it('should return true', () => {
                const url = 'https://app.fedi.xyz/link#screen=chat'
                expect(linking.isDeepLink(url)).toBe(true)
            })
        })
    })
})
