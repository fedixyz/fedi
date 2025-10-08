import invoiceUtils from '../../../utils/InvoiceUtils'

describe('InvoiceUtils', () => {
    describe('getAmountFromInvoice', () => {
        it('correctly decodes 10 sat invoice', () => {
            const amount = invoiceUtils.getAmountFromInvoice(
                'lnbcrt100n1p3c4ltydq0w3jhxapqd4jk6mcpp5sprlsmg8cwnfy74r43y575vg3wxe3psq5whrzggcsphz4xf989wqsp50m0cuc2lusxqsj4lr0s8s8y6j68svgtv4h0medpg7ydrchlj2hqq9qrsgqcqpjnp4qdkd47qk66uxhy2uzwfzef27v6nhj7gfcc088xam5j0f4vlna5ahurzjqwghfctufkalr88676rtjcqfuxc4j73xzqtlp6fqgcvplajy0ajrwqqqqqqqqqqqpqqqqqqqqqqqqqqqrcxqrrssddv0lyqk6acz2e4f7ysepjfmqksmxvvtg4mx9merll4759ukfm0sk8nwqp4y2zwd8r2nrydcn7s4wjed36cvhjx3wwf7cjt5jrhf5ecqhskz2p',
            )

            expect(amount).toEqual('10')
        })
    })
})
