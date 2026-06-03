import {
    InjectionMessageResponseMap,
    InjectionMessageType as T,
} from '@fedi/injections/src/types'

export type Custom = Record<string, string>
type Data<K extends T> = InjectionMessageResponseMap[K]['message']

export interface InputField {
    key: string
    label: string
    placeholder: string
    multiline?: boolean
}

export interface ApiDef {
    type: T
    inputs?: InputField[]
    variants: { label: string; data: unknown | ((c: Custom) => unknown) }[]
}

export interface LogEntry {
    id: number
    timestamp: string
    api: string
    status: 'pending' | 'success' | 'error'
    response?: unknown
    error?: string
}

// Narrows K per call so variant.data is type-checked against the message type.
function defineApi<K extends T>(
    type: K,
    def: {
        inputs?: InputField[]
        variants: {
            label: string
            data: Data<K> | ((c: Custom) => Data<K>)
        }[]
    },
): ApiDef {
    return { type, ...def } as ApiDef
}

export const resolveData = (data: unknown, custom: Custom): unknown =>
    typeof data === 'function' ? data(custom) : data

const SAMPLE_PUBKEY =
    '32e1827635450ebb3c5a7d12c1f8e7b2b514439ac10a67eef3d9fd9c5c68e245'
const nowSec = () => Math.floor(Date.now() / 1000)
const toInt = (value: string | undefined, fallback: number): number => {
    const n = parseInt(value ?? '', 10)
    return Number.isFinite(n) ? n : fallback
}

export const apis: ApiDef[] = [
    defineApi(T.webln_enable, {
        variants: [{ label: 'Call', data: undefined }],
    }),
    defineApi(T.webln_getInfo, {
        variants: [{ label: 'Call', data: undefined }],
    }),
    defineApi(T.webln_makeInvoice, {
        inputs: [
            {
                key: 'inv_amount',
                label: 'Custom amount (sats)',
                placeholder: '2500',
            },
            { key: 'inv_min', label: 'Custom min (sats)', placeholder: '500' },
            {
                key: 'inv_max',
                label: 'Custom max (sats)',
                placeholder: '25000',
            },
        ],
        variants: [
            { label: '1k sats', data: { amount: 1000, defaultMemo: 'Test' } },
            {
                label: '10k sats',
                data: { amount: 10000, defaultMemo: 'Larger test' },
            },
            {
                label: 'Default 5k',
                data: {
                    defaultAmount: 5000,
                    defaultMemo: 'Suggested amount (user can change)',
                },
            },
            {
                label: 'Range 100-50k',
                data: {
                    minimumAmount: 100,
                    maximumAmount: 50000,
                    defaultMemo: 'Range',
                },
            },
            { label: 'Memo only', data: { defaultMemo: 'User enters amount' } },
            {
                label: 'Custom amount',
                data: c => ({
                    amount: toInt(c.inv_amount, 2500),
                    defaultMemo: 'Custom test invoice',
                }),
            },
            {
                label: 'Custom range',
                data: c => ({
                    minimumAmount: toInt(c.inv_min, 500),
                    maximumAmount: toInt(c.inv_max, 25000),
                    defaultMemo: 'Custom range invoice',
                }),
            },
        ],
    }),
    defineApi(T.webln_sendPayment, {
        inputs: [
            {
                key: 'invoice',
                label: 'BOLT11',
                placeholder: 'lnbc...',
                multiline: true,
            },
        ],
        variants: [{ label: 'Pay', data: c => c.invoice || '' }],
    }),
    defineApi(T.webln_signMessage, {
        variants: [
            { label: 'Call', data: 'Hello from MiniApp API debug tool' },
        ],
    }),
    defineApi(T.webln_verifyMessage, {
        variants: [
            {
                label: 'Call',
                data: {
                    signature: 'fakesig123',
                    message: 'Hello from debug tool',
                },
            },
        ],
    }),
    defineApi(T.webln_keysend, {
        variants: [
            {
                label: 'Call',
                data: {
                    destination:
                        '03e7156ae33b0a208d0744199163177e909e80176e55d97a2f221ede0f934dd9ad',
                    amount: 100,
                },
            },
        ],
    }),
    defineApi(T.nostr_getPublicKey, {
        variants: [{ label: 'Call', data: undefined }],
    }),
    defineApi(T.nostr_signEvent, {
        variants: [
            {
                label: 'Kind 1 (note)',
                data: () => ({
                    kind: 1,
                    created_at: nowSec(),
                    content: 'Hello from MiniApp API debug tool!',
                    tags: [],
                }),
            },
            {
                label: 'Kind 0 (metadata)',
                data: () => ({
                    kind: 0,
                    created_at: nowSec(),
                    content: JSON.stringify({
                        name: 'MiniApp Debug User',
                        about: 'Testing from debug tool',
                    }),
                    tags: [],
                }),
            },
            {
                label: 'Kind 4 (DM)',
                data: () => ({
                    kind: 4,
                    created_at: nowSec(),
                    content: 'encrypted-placeholder',
                    tags: [['p', SAMPLE_PUBKEY]],
                }),
            },
        ],
    }),
    defineApi(T.nostr_encrypt, {
        inputs: [
            { key: 'e44_pk', label: 'Pubkey', placeholder: SAMPLE_PUBKEY },
            {
                key: 'e44_pt',
                label: 'Plaintext',
                placeholder: 'Secret message',
            },
        ],
        variants: [
            {
                label: 'NIP-44 encrypt',
                data: c => ({
                    pubkey: c.e44_pk || SAMPLE_PUBKEY,
                    plaintext: c.e44_pt || 'Secret via NIP-44',
                }),
            },
        ],
    }),
    defineApi(T.nostr_decrypt, {
        inputs: [
            { key: 'd44_pk', label: 'Pubkey', placeholder: SAMPLE_PUBKEY },
            {
                key: 'd44_ct',
                label: 'Ciphertext',
                placeholder: 'paste ciphertext...',
                multiline: true,
            },
        ],
        variants: [
            {
                label: 'NIP-44 decrypt',
                data: c => ({
                    pubkey: c.d44_pk || SAMPLE_PUBKEY,
                    ciphertext: c.d44_ct || '',
                }),
            },
        ],
    }),
    defineApi(T.nostr_encrypt04, {
        inputs: [
            { key: 'e04_pk', label: 'Pubkey', placeholder: SAMPLE_PUBKEY },
            {
                key: 'e04_pt',
                label: 'Plaintext',
                placeholder: 'Secret message',
            },
        ],
        variants: [
            {
                label: 'NIP-04 encrypt',
                data: c => ({
                    pubkey: c.e04_pk || SAMPLE_PUBKEY,
                    plaintext: c.e04_pt || 'Secret via NIP-04',
                }),
            },
        ],
    }),
    defineApi(T.nostr_decrypt04, {
        inputs: [
            { key: 'd04_pk', label: 'Pubkey', placeholder: SAMPLE_PUBKEY },
            {
                key: 'd04_ct',
                label: 'Ciphertext',
                placeholder: 'paste ciphertext...',
                multiline: true,
            },
        ],
        variants: [
            {
                label: 'NIP-04 decrypt',
                data: c => ({
                    pubkey: c.d04_pk || SAMPLE_PUBKEY,
                    ciphertext: c.d04_ct || '',
                }),
            },
        ],
    }),
    defineApi(T.fedi_getAuthenticatedMember, {
        variants: [{ label: 'Call', data: undefined }],
    }),
    defineApi(T.fedi_getCurrencyCode, {
        variants: [{ label: 'Call', data: undefined }],
    }),
    defineApi(T.fedi_getLanguageCode, {
        variants: [{ label: 'Call', data: undefined }],
    }),
    defineApi(T.fedi_generateEcash, {
        inputs: [
            { key: 'ecash_amt', label: 'Amount (sats)', placeholder: '500' },
        ],
        variants: [
            { label: '1k', data: { amount: 1000 } },
            { label: '10k', data: { amount: 10000 } },
            {
                label: 'Custom',
                data: c => ({ amount: toInt(c.ecash_amt, 500) }),
            },
        ],
    }),
    defineApi(T.fedi_receiveEcash, {
        inputs: [
            {
                key: 'ecash_notes',
                label: 'Ecash notes',
                placeholder: 'paste ecash...',
                multiline: true,
            },
        ],
        variants: [{ label: 'Receive', data: c => c.ecash_notes || '' }],
    }),
    defineApi(T.fedi_listCreatedCommunities, {
        variants: [{ label: 'Call', data: undefined }],
    }),
    defineApi(T.fedi_createCommunity, {
        inputs: [{ key: 'cc_name', label: 'Name', placeholder: 'Debug Test' }],
        variants: [
            {
                label: 'Create',
                data: c => ({
                    name: c.cc_name || 'Debug Test Community',
                    welcome_message: 'Created from debug tool',
                    preview_message: 'A test community',
                }),
            },
        ],
    }),
    defineApi(T.fedi_editCommunity, {
        inputs: [
            { key: 'ec_id', label: 'Community ID', placeholder: '...' },
            { key: 'ec_name', label: 'New name', placeholder: 'Updated name' },
        ],
        variants: [
            {
                label: 'Edit',
                data: c => ({
                    communityId: c.ec_id || '',
                    editedCommunity: {
                        name: c.ec_name || 'Updated name',
                        welcome_message: 'Updated from debug tool',
                    },
                }),
            },
        ],
    }),
    defineApi(T.fedi_deleteCommunity, {
        inputs: [{ key: 'dc_id', label: 'Community ID', placeholder: '...' }],
        variants: [
            { label: 'Delete', data: c => ({ communityId: c.dc_id || '' }) },
        ],
    }),
    defineApi(T.fedi_joinCommunity, {
        inputs: [
            { key: 'jc_code', label: 'Invite code', placeholder: 'paste...' },
        ],
        variants: [{ label: 'Join', data: c => c.jc_code || '' }],
    }),
    defineApi(T.fedi_setSelectedCommunity, {
        inputs: [{ key: 'sc_id', label: 'Community ID', placeholder: '...' }],
        variants: [{ label: 'Select', data: c => c.sc_id || '' }],
    }),
    defineApi(T.fedi_refreshCommunities, {
        variants: [{ label: 'Call', data: undefined }],
    }),
    defineApi(T.fedi_selectPublicChats, {
        variants: [{ label: 'Open overlay', data: undefined }],
    }),
    defineApi(T.fedi_navigateHome, {
        variants: [{ label: 'Go home', data: undefined }],
    }),
    defineApi(T.fedi_getInstalledMiniApps, {
        variants: [{ label: 'List', data: undefined }],
    }),
    defineApi(T.fedi_installMiniApp, {
        inputs: [
            { key: 'im_id', label: 'ID', placeholder: 'debug-sample-app' },
            {
                key: 'im_title',
                label: 'Title',
                placeholder: 'Debug Sample App',
            },
            {
                key: 'im_url',
                label: 'URL',
                placeholder: 'https://example.com/app',
            },
            {
                key: 'im_img',
                label: 'Image URL',
                placeholder: 'https://placehold.co/64',
            },
        ],
        variants: [
            {
                label: 'Install',
                data: c => ({
                    id: c.im_id || 'debug-sample-app',
                    title: c.im_title || 'Debug Sample App',
                    url: c.im_url || 'https://example.com/app',
                    imageUrl:
                        c.im_img ||
                        'https://placehold.co/64x64/4F46E5/white?text=DBG',
                }),
            },
        ],
    }),
    defineApi(T.fedi_previewMatrixRoom, {
        inputs: [
            {
                key: 'pr_id',
                label: 'Room ID',
                placeholder: '!roomid:matrix.org',
            },
        ],
        variants: [{ label: 'Preview', data: c => c.pr_id || '' }],
    }),
]
