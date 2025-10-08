import { bech32 } from 'bech32'
import { t } from 'i18next'
import { rest } from 'msw'
import { setupServer } from 'msw/node'

import { Invoice, MSats } from '../../../types'
import { RpcAmount } from '../../../types/bindings'
import { ParserDataType } from '../../../types/parser'
import { FedimintBridge } from '../../../utils/fedimint'
import { parseUserInput } from '../../../utils/parser'

// Constants
const mockFedId = 'fed1'
const simpleBolt11 =
    'lntbs1u1pj29m0mdqqpp5f3lrcsfe7m7x62k20k6x8l279s62ez38mhy2uc40f89x4va7r6zqsp5gqdp3kfkfefshgu3t7vplzztyyl79rfhk6kfvxe7dl0kgjxha7zq9qrsgqcqpjnp4q28uv5wxgqhmvqct7lp4kctp56awacjghpu0wxmnf4afgc58lda4wxqrrssrzjqftf3ny6cc3lt5d67433puh3kcklllhy8l7dktpqej65racyjl25qqqqqqqqqqqqqyqqqqqqqqqqqqqqrcjt2mnevzr9xwwldcnemhmpz5g5g4qf0p9drvtyan7c4aclf5uxnkk4tg2d2c59dyjd6t9t7zv39netdm7t28575e0hr3qne7czj98ecqkfy89d'
const simpleBolt11Invoice: Invoice = {
    paymentHash:
        '4c7e3c4139f6fc6d2aca7db463fd5e2c34ac8a27ddc8ae62af49ca6ab3be1e84',
    amount: 100000 as MSats,
    description: '',
    invoice: simpleBolt11,
    fee: {
        fediFee: 0 as RpcAmount,
        networkFee: 0 as RpcAmount,
        federationFee: 0 as RpcAmount,
    },
}
const simpleBolt11Data = {
    bolt11: simpleBolt11,
    ...simpleBolt11Invoice,
}
const simpleV0Ecash =
    'AAAAAAAAAAUAAAAAAAAAEAAAAAAAAAABytv3ApZWgVAEsPVB/wSW7xGwEWAyXNWZnw1MZMWBBsuYhk+hrVdUAn5fOpAupYeaJ1saucJeD5t/5dIFYKYU5KY/G6aRf8cJVqfLZ3DWDbbo2VNbALxflAzR3YYOopF49G5hUC2oYattZdjM2uEtRQAAAAAAAAEAAAAAAAAAAAE6qbWNeYV/DSx5tpJz4dG3NOmT4+KY6+DmI1+bUV75VaKPsoT629eC4HQolANvFF4VLd7SOphWotT1l3WST9jJIhbvKqmyHmLMSvVVld/czTlP9LM/O2tFS6KM8SMDvxsU+PlV6ZNeIeXq1Fz1QdMmAAAAAAAAAgAAAAAAAAAAAVEMS56MnlPEm/Y0/Cn5KXjQsC8/vMfhN+E/Y4tvWfebtxVHtKPk7dhJqC3P8mR0M6cw5qyTXq4vuDN3GVWQMh1oOMAveatU88IUuno5sz2jDTX0M8bJ2ujQHKKNXwMaafQMDiWpoa8jRhv3jKpIUREAAAAAAAAEAAAAAAAAAAABPvyMsEtqen8ZCoSJ28QyELg6fxNINzdLeKHU0pLv532rjLwME41b9aFevg3+HEblxlMWyc0F1DnO0doaX0of2hv2hs1bPFXyMLPlinxfpcjRE/mylF0D7Ogm8oBHXhxQohr6Bzi4fE2iYF3/gW3mXQAAAAAAACAAAAAAAAAAAAGmwrUa8fH8xbftLJQM4HhRDsRJjOTWgOIpLSDO0i6OsIqMBqxQRBiJ9DH9ji2skiQ5s0DEKpnDQcMsvCUpIJs+6UhERT/lFzqZiqfGK4ljDkG3GkNU9kPMrL7LfW1KGtDvj5+I1hO+kKoANDfPxi66'

const cashuEcashToken =
    'cashuAeyJ0b2tlbiI6W3sicHJvb2ZzIjpbeyJpZCI6IkkyeU4raVJZZmt6VCIsImFtb3VudCI6MSwiQyI6IjAyMTVkNDJkN2JiZDI4MTgyNWVmOWI5MzJiMjdkZWZlM2U2M2U2YjhhYzBmOWY0OTllNWNmNzdlNWIxMGRlYTc3YiIsInNlY3JldCI6InBWZmYwTHdCSXNQT2N6TDdzMGpkQVo0NEpMZ0l1NDFEK0VUSGMrblV4cXc9In1dLCJtaW50IjoiaHR0cHM6Ly84MzMzLnNwYWNlOjMzMzgifV19'
const complexBolt11 =
    'lnbc20u1p3y0x3hpp5743k2g0fsqqxj7n8qzuhns5gmkk4djeejk3wkp64ppevgekvc0jsdqcve5kzar2v9nr5gpqd4hkuetesp5ez2g297jduwc20t6lmqlsg3man0vf2jfd8ar9fh8fhn2g8yttfkqxqy9gcqcqzys9qrsgqrzjqtx3k77yrrav9hye7zar2rtqlfkytl094dsp0ms5majzth6gt7ca6uhdkxl983uywgqqqqlgqqqvx5qqjqrzjqd98kxkpyw0l9tyy8r8q57k7zpy9zjmh6sez752wj6gcumqnj3yxzhdsmg6qq56utgqqqqqqqqqqqeqqjq7jd56882gtxhrjm03c93aacyfy306m4fq0tskf83c0nmet8zc2lxyyg3saz8x6vwcp26xnrlagf9semau3qm2glysp7sv95693fphvsp54l567'
const complexBolt11Invoice: Invoice = {
    paymentHash:
        'f5636521e98000697a6700b979c288ddad56cb3995a2eb07550872c466ccc3e5',
    amount: 2000000 as MSats,
    description: 'fiatjaf: money',
    invoice: complexBolt11,
    fee: {
        fediFee: 0 as RpcAmount,
        networkFee: 0 as RpcAmount,
        federationFee: 0 as RpcAmount,
    },
}
const complexBolt11Data = {
    bolt11: complexBolt11,
    ...complexBolt11Invoice,
}

const lnurlDomain = 'example.com'
const lnurlOrigin = `https://${lnurlDomain}`
const lnurlk1 = '123456'
const lnurlAddressName = 'test'
const lnurlAddress = `${lnurlAddressName}@${lnurlDomain}`
const lnurlPayUrl = `${lnurlOrigin}/pay?tag=payRequest&k1=${lnurlk1}`
const LnurlWithdrawUrl = `${lnurlOrigin}/withdraw?tag=withdrawRequest&k1=${lnurlk1}`
const lnurlAuthUrl = `${lnurlOrigin}/auth?tag=login&k1=${lnurlk1}`
const encodeLnurl = (url: string) =>
    bech32.encode('lnurl', bech32.toWords(Buffer.from(url, 'utf8')), 1023)
const lnurlPayParams = {
    tag: 'payRequest',
    callback: `${lnurlOrigin}/a`,
    metadata: [
        [
            'text/plain', // mandatory
            'Testers testing tests',
        ],
        [
            'image/png;base64',
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVQYV2NgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=',
        ],
    ],
    minSendable: 1,
    maxSendable: 1000000,
}

describe('parseUserInput', () => {
    // --- Mock API for LNURLs ---
    const server = setupServer(
        rest.get(lnurlOrigin, (_req, res, ctx) => {
            return res(
                ctx.status(200),
                ctx.set('Content-Type', 'text/html'),
                ctx.body('<h1>Sup</h1>'),
            )
        }),
        rest.get(`${lnurlOrigin}/pay`, (_req, res, ctx) => {
            return res(ctx.status(200), ctx.json(lnurlPayParams))
        }),
        rest.get(`${lnurlOrigin}/withdraw`, (_req, res, ctx) => {
            return res(
                ctx.status(200),
                ctx.json({
                    tag: 'withdrawRequest',
                    callback: `${lnurlOrigin}/a`,
                    k1: lnurlk1,
                    defaultDescription: 'test',
                    minWithdrawable: 1,
                    maxWithdrawable: 1000000,
                }),
            )
        }),
        rest.get(`${lnurlOrigin}/auth`, (_req, res, ctx) => {
            return res(ctx.status(200), ctx.json({ status: 'OK' }))
        }),
        rest.get(
            `${lnurlOrigin}/.well-known/lnurlp/${lnurlAddressName}`,
            (_req, res, ctx) => {
                return res(ctx.status(200), ctx.json(lnurlPayParams))
            },
        ),
    )
    beforeAll(() => {
        server.listen({ onUnhandledRequest: 'warn' })

        // Mock network request to return a 404 for "www.fedi.xyz"
        server.use(
            rest.get('https://www.fedi.xyz', (_req, res, ctx) => {
                return res.once(ctx.status(404), ctx.delay(1)) // Return fast response
            }),
        )
    })
    afterEach(() => server.resetHandlers())
    afterAll(() => server.close())

    const testCases = []

    // --- BOLT 11 ---

    testCases.push({
        input: simpleBolt11,
        type: ParserDataType.Bolt11,
        data: simpleBolt11Data,
    })
    testCases.push({
        input: simpleBolt11.toUpperCase(),
        type: ParserDataType.Bolt11,
        data: simpleBolt11Data,
    })
    testCases.push({
        input: `lightning:${simpleBolt11}`,
        type: ParserDataType.Bolt11,
        data: simpleBolt11Data,
    })
    testCases.push({
        input: `lightning:${simpleBolt11}`.toUpperCase(),
        type: ParserDataType.Bolt11,
        data: simpleBolt11Data,
    })
    testCases.push({
        input: `lightning://${simpleBolt11}`,
        type: ParserDataType.Bolt11,
        data: simpleBolt11Data,
    })
    testCases.push({
        input: complexBolt11,
        type: ParserDataType.Bolt11,
        data: complexBolt11Data,
    })

    // --- BOLT 12 ---

    const simpleBolt12 = `lno1pg257enxv4ezqcneype82um50ynhxgrwdajx293pqglnyxw6q0hzngfdusg8umzuxe8kquuz7pjl90ldj8wadwgs0xlmc`
    testCases.push({
        input: simpleBolt12,
        type: ParserDataType.Bolt12,
        data: null,
    })
    testCases.push({
        input: simpleBolt12.toUpperCase(),
        type: ParserDataType.Bolt12,
        data: null,
    })
    testCases.push({
        input: `lightning:${simpleBolt12}`,
        type: ParserDataType.Bolt12,
        data: null,
    })
    testCases.push({
        input: `lightning://${simpleBolt12}`,
        type: ParserDataType.Bolt12,
        data: null,
    })

    // --- LNURL ---

    testCases.push({
        input: encodeLnurl(lnurlPayUrl),
        type: ParserDataType.LnurlPay,
    })
    testCases.push({
        input: encodeLnurl(lnurlPayUrl).toUpperCase(),
        type: ParserDataType.LnurlPay,
    })
    testCases.push({
        input: `lightning:${encodeLnurl(lnurlPayUrl)}`,
        type: ParserDataType.LnurlPay,
    })
    testCases.push({
        input: `lnurl:${encodeLnurl(lnurlPayUrl)}`,
        type: ParserDataType.LnurlPay,
    })
    testCases.push({
        input: lnurlPayUrl.replace('https', 'lnurlp'),
        type: ParserDataType.LnurlPay,
    })
    testCases.push({
        input: LnurlWithdrawUrl.replace('https', 'lnurlw'),
        type: ParserDataType.LnurlWithdraw,
    })
    testCases.push({
        input: lnurlAuthUrl.replace('https', 'keyauth'),
        type: ParserDataType.LnurlAuth,
    })
    testCases.push({
        input: lnurlAddress,
        type: ParserDataType.LnurlPay,
    })

    testCases.push({
        input: lnurlOrigin,
        type: ParserDataType.Website,
        data: { url: 'https://fedi.xyz' },
    })
    testCases.push({
        input: `${lnurlOrigin}/?lightning=${encodeLnurl(lnurlPayUrl)}`,
        type: ParserDataType.LnurlPay,
    })
    testCases.push({
        input: `${lnurlOrigin}/?lightning=lnurl12345`, // Not a proper lnurl, falls back on website
        type: ParserDataType.Website,
    })
    testCases.push({
        input: 'www.fedi.xyz', // Not a proper url
        type: ParserDataType.OfflineError,
        data: {},
    })

    // --- Bitcoin address ---

    const p2pkhAddress = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2'
    const p2shAddress = '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy'
    const p2wpkhAddress = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'
    const p2trAddress =
        'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297'

    testCases.push({
        input: p2pkhAddress,
        type: ParserDataType.BitcoinAddress,
        data: { address: p2pkhAddress },
    })
    testCases.push({
        input: p2shAddress,
        type: ParserDataType.BitcoinAddress,
        data: { address: p2shAddress },
    })
    testCases.push({
        input: p2wpkhAddress,
        type: ParserDataType.BitcoinAddress,
        data: { address: p2wpkhAddress },
    })
    testCases.push({
        input: p2trAddress,
        type: ParserDataType.BitcoinAddress,
        data: { address: p2trAddress },
    })

    // --- BIP 21 ---

    testCases.push({
        input: `bitcoin:${p2wpkhAddress}`,
        type: ParserDataType.Bip21,
        data: {},
    })
    testCases.push({
        input: `bitcoin://${p2wpkhAddress}`,
        type: ParserDataType.Bip21,
        data: {},
    })
    testCases.push({
        input: `bitcoin:${p2wpkhAddress}?amount=1.5&label=Example%20Merchant&message=Purchase%20at%20Example%20Merchant`,
        type: ParserDataType.Bip21,
        data: {
            address: p2wpkhAddress,
            amount: 1.5,
            label: 'Example Merchant',
            message: 'Purchase at Example Merchant',
        },
    })
    testCases.push({
        input: `bitcoin:${p2wpkhAddress}?lightning=${simpleBolt11}`,
        type: ParserDataType.Bolt11,
        data: {
            ...simpleBolt11Data,
            fallbackAddress: p2wpkhAddress,
        },
    })

    // --- Cashu Ecash ---
    testCases.push({
        input: cashuEcashToken,
        type: ParserDataType.CashuEcash,
        data: null,
    })
    testCases.push({
        input: `cashu:${cashuEcashToken}`,
        type: ParserDataType.CashuEcash,
        data: null,
    })
    testCases.push({
        input: `cashu://${cashuEcashToken}`,
        type: ParserDataType.CashuEcash,
        data: null,
    })
    testCases.push({
        input: `web+cashu://${cashuEcashToken}`,
        type: ParserDataType.CashuEcash,
        data: null,
    })

    // --- Fedimint invite ---

    testCases.push({
        input: `fed11jpr3lgm8tuhcky2r3g287tgk9du7dd7kr95fptdsmkca7cwcvyu0lyqeh0e6rgp4u0shxsfaxycpwqpfwaehxw309askcurgvyhx6at5d9h8jmn9wsknqvfwv3jhvtnxv4jxjcn5vvhxxmmd9udpnpn49yg9w98dejw9u76hmm9`,
        type: ParserDataType.FedimintInvite,
        data: null,
    })

    // --- Fedimint ecash ---

    testCases.push({
        input: simpleV0Ecash,
        type: ParserDataType.FedimintEcash,
        data: null,
    })

    // --- Fedi Chat ---

    testCases.push({
        input: `fedi:member:user@xmpp.com:::`,
        type: ParserDataType.LegacyFediChatMember,
        data: { id: 'user@xmpp.com' },
    })
    testCases.push({
        input: `fedi:group:12345:::`,
        type: ParserDataType.LegacyFediChatGroup,
        data: { id: '12345' },
    })
    testCases.push({
        input: `fedi:user:@user:example.com`,
        //fedi:user:@npub1a6udwnm4qlnewfda0993nn9845vk4e3z2m2r6hjh9q3kl7830sss860a0t:matrix-dendrite-homeserver2.dev.fedibtc.com
        type: ParserDataType.FediChatUser,
        data: { id: '@user:example.com' },
    })

    // --- Unknown ---

    testCases.push({
        input: 'this is random text',
        type: ParserDataType.OfflineError,
        data: {},
    })

    // --- Run the tests ---

    const fedimint = {
        decodeInvoice: async (invoice: string) => {
            if (invoice === simpleBolt11) {
                return simpleBolt11Invoice
            }
            if (invoice === complexBolt11) {
                return complexBolt11Invoice
            }
        },
        validateEcash: async (ecash: string) => {
            if (ecash === simpleV0Ecash) {
                return { amount: 1 }
            }
            throw Error('Failed to parse')
        },
        matrixUserProfile: async ({ userId }: { userId: string }) => {
            if (userId === '@user:example.com') return { displayname: 'user' }
        },
    } as unknown as FedimintBridge

    const truncate = (str: string) =>
        str.length > 40 ? `${str.slice(0, 37)}...` : str

    for (const testCase of testCases) {
        it(`parses ${testCase.type} from ${truncate(testCase.input)}`, async () => {
            const parsed = await parseUserInput(
                testCase.input,
                fedimint,
                t,
                mockFedId,
                testCase.input === 'www.fedi.xyz' ||
                    testCase.input === 'this is random text'
                    ? true
                    : false,
            )
            expect(parsed.type).toEqual(testCase.type)
        }, 2000) // Increase timeout to 2 seconds
    }
})
