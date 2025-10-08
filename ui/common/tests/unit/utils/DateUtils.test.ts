import dateUtils from '../../../utils/DateUtils'

describe('DateUtils', () => {
    describe('formatTimestamp', () => {
        it('should use default format yyyy-MM-dd is used if dateFormat not provided', () => {
            const formatted = dateUtils.formatTimestamp(1231006505)

            expect(formatted).toEqual('2009-01-03')
        })
        it('should throw an error if millisconds are used', () => {
            expect(() => {
                dateUtils.formatTimestamp(1231006505000)
            }).toThrowError()
        })
    })
})
