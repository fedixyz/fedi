import Clipboard from '@react-native-clipboard/clipboard'
import {
    cleanup,
    fireEvent,
    screen,
    userEvent,
    waitFor,
} from '@testing-library/react-native'
import { bech32m } from 'bech32'

import { setFaStatus, setupStore } from '@fedi/common/redux'
import {
    createMockFederationPreview,
    createMockRpcCommunity,
} from '@fedi/common/tests/mock-data/federation'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import type {
    RpcCommunity,
    RpcFaOperationResult,
} from '@fedi/common/types/bindings'
import { stripFediPrefix } from '@fedi/common/utils/linking'

import i18n from '../../../localization/i18n'
import WalletServiceAutojoinSpaces from '../../../screens/WalletServiceAutojoinSpaces'
import {
    mockNavigation,
    mockRoute,
    mockToast,
} from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

const AUTOJOIN_KEY = 'fedi:autojoin_communities'

/** A space code with a valid checksum: the editor refuses any other. */
const spaceCode = (seed: number) =>
    bech32m.encode(
        'fedi:community2',
        bech32m.toWords(Buffer.from(Array(40).fill(seed))),
        2000,
    )

const SIGNAL = spaceCode(1)
const SAVERS = spaceCode(2)
/** Valid codes whose preview always fails. */
const GONE = spaceCode(3)
const UNKNOWN = spaceCode(4)
const FEDERATION_CODE = 'fed11qgqzc2nhwden5te0v'

const community = (code: string, name: string): RpcCommunity =>
    createMockRpcCommunity({
        communityInvite: {
            type: 'legacy',
            invite_code_str: code,
            community_meta_url: 'https://example.com/meta.json',
        },
        name,
        meta: {},
    })

/** Spaces the community preview can resolve, by lowercased code. */
const KNOWN_SPACES: Record<string, string> = {
    [SIGNAL]: 'Signal in the Noise',
    [SAVERS]: 'Morpheus Savers',
}

const makeBridge = ({
    published,
    created = [],
    update = { type: 'success' },
}: {
    /** The auto-join list the federation publishes, as JSON text. */
    published?: string
    created?: RpcCommunity[]
    update?: RpcFaOperationResult
} = {}) => {
    const fedimint = createMockFedimintBridge({
        federationPreview: () =>
            Promise.resolve(
                createMockFederationPreview({
                    meta:
                        published === undefined
                            ? {}
                            : { [AUTOJOIN_KEY]: published },
                }),
            ),
        parseInviteCode: () =>
            Promise.resolve({
                federationId: 'wallet-service-federation',
                url: 'wss://guardian.example',
            }),
        communityPreview: ({ inviteCode }: { inviteCode: string }) =>
            KNOWN_SPACES[inviteCode]
                ? Promise.resolve(
                      community(inviteCode, KNOWN_SPACES[inviteCode]),
                  )
                : Promise.reject(new Error('community not found')),
        faClientUpdateFederationMetadata: () => Promise.resolve(update),
    })
    // a bridge wrapper over `nostrListOurCommunities`, not an rpc name, so the
    // mock builder cannot be handed it by key
    fedimint.listCreatedCommunities = jest.fn().mockResolvedValue(created)
    return fedimint
}

const renderScreen = (fedimint = makeBridge()) => {
    const store = setupStore()
    store.dispatch(
        setFaStatus({
            type: 'formed',
            federation: {
                formationId: 'formation-1',
                federationInvite: 'fed11invite',
                federationName: 'Morpheus',
                seats: [],
                freshness: 'fresh',
                backupEligible: true,
                origin: 'thisDevice',
            },
        }),
    )
    renderWithProviders(
        <WalletServiceAutojoinSpaces
            navigation={mockNavigation as never}
            route={mockRoute as never}
        />,
        { store, fedimint },
    )
    return fedimint
}

const appSetting = (value: string) => ({
    type: 'appSetting',
    setting: 'autojoinCommunities',
    value,
})

describe('screens/WalletServiceAutojoinSpaces', () => {
    let user: ReturnType<typeof userEvent.setup>

    beforeEach(() => {
        user = userEvent.setup()
    })

    afterEach(() => {
        cleanup()
        jest.clearAllMocks()
    })

    it('should show each published space by name with the count', async () => {
        renderScreen(makeBridge({ published: JSON.stringify([SIGNAL]) }))

        expect(await screen.findByText('Signal in the Noise')).toBeOnTheScreen()
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.settings-autojoin-limit', {
                    count: 1,
                    max: 10,
                }),
            ),
        ).toBeOnTheScreen()
    })

    it('should count a code published twice in different cases once', async () => {
        renderScreen(
            makeBridge({
                published: JSON.stringify([SIGNAL, SIGNAL.toUpperCase()]),
            }),
        )

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.settings-autojoin-limit', {
                    count: 1,
                    max: 10,
                }),
            ),
        ).toBeOnTheScreen()
    })

    it('should keep a space whose preview fails removable', async () => {
        const fedimint = renderScreen(
            makeBridge({ published: '["fedi:community1gone"]' }),
        )

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.settings-autojoin-not-found'),
            ),
        ).toBeOnTheScreen()
        await user.press(screen.getByTestId('autojoin-remove-0'))
        await user.press(screen.getByTestId('autojoin-confirm-remove'))

        await waitFor(() =>
            expect(
                fedimint.faClientUpdateFederationMetadata,
            ).toHaveBeenCalledWith(appSetting('[]')),
        )
    })

    it('should show the empty state when nothing is published', async () => {
        const fedimint = renderScreen()

        await waitFor(() =>
            expect(fedimint.federationPreview).toHaveBeenCalledTimes(1),
        )
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.settings-autojoin-empty-title'),
            ),
        ).toBeOnTheScreen()
    })

    describe('when the first read of the published list fails', () => {
        const renderFailedRead = () => {
            const fedimint = makeBridge({ published: JSON.stringify([SIGNAL]) })
            jest.mocked(fedimint.federationPreview).mockRejectedValueOnce(
                new Error('bridge down'),
            )
            return renderScreen(fedimint)
        }

        it('should show the error and Retry instead of the empty state', async () => {
            renderFailedRead()

            expect(
                await screen.findByTestId('autojoin-load-error'),
            ).toBeOnTheScreen()
            expect(
                screen.getByText(
                    i18n.t(
                        'feature.wallet-service.settings-autojoin-load-failed',
                    ),
                ),
            ).toBeOnTheScreen()
            expect(screen.getByTestId('autojoin-load-retry')).toBeOnTheScreen()
            expect(
                screen.queryByText(
                    i18n.t(
                        'feature.wallet-service.settings-autojoin-empty-title',
                    ),
                ),
            ).toBeNull()
        })

        it('should read again on Retry and show the list', async () => {
            const fedimint = renderFailedRead()

            await user.press(await screen.findByTestId('autojoin-load-retry'))

            expect(
                await screen.findByText('Signal in the Noise'),
            ).toBeOnTheScreen()
            expect(fedimint.federationPreview).toHaveBeenCalledTimes(2)
            expect(fedimint.federationPreview).toHaveBeenLastCalledWith(
                'fed11invite',
            )
            expect(screen.queryByTestId('autojoin-load-error')).toBeNull()
        })
    })

    it('should save a picked space appended to the list, lowercased', async () => {
        const fedimint = renderScreen(
            makeBridge({
                published: JSON.stringify([SIGNAL]),
                created: [community(SAVERS.toUpperCase(), 'Morpheus Savers')],
            }),
        )
        await screen.findByText('Signal in the Noise')

        await user.press(screen.getByTestId('autojoin-add'))
        await user.press(await screen.findByTestId('autojoin-pick-0'))
        await user.press(screen.getByTestId('autojoin-add-confirm'))

        await waitFor(() =>
            expect(
                fedimint.faClientUpdateFederationMetadata,
            ).toHaveBeenCalledWith(
                appSetting(JSON.stringify([SIGNAL, SAVERS])),
            ),
        )
        expect(fedimint.faClientUpdateFederationMetadata).toHaveBeenCalledTimes(
            1,
        )
        expect(mockToast.show).toHaveBeenCalledWith({
            content: i18n.t('feature.wallet-service.settings-autojoin-saved'),
            status: 'success',
        })
        // held on screen before consensus reports it
        expect(await screen.findByText('Morpheus Savers')).toBeOnTheScreen()
    })

    it('should show a linked space as linked and not let it be picked again', async () => {
        const fedimint = renderScreen(
            makeBridge({
                published: JSON.stringify([SIGNAL]),
                created: [community(SIGNAL, 'Signal in the Noise')],
            }),
        )
        await screen.findByText('Signal in the Noise')

        await user.press(screen.getByTestId('autojoin-add'))
        await user.press(await screen.findByTestId('autojoin-pick-0'))

        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.settings-autojoin-linked'),
            ),
        ).toBeOnTheScreen()
        expect(screen.getByTestId('autojoin-add-confirm')).toBeDisabled()
        await user.press(screen.getByTestId('autojoin-add-confirm'))
        expect(fedimint.faClientUpdateFederationMetadata).not.toHaveBeenCalled()
    })

    it('should de-duplicate and lowercase the list on a remove', async () => {
        const fedimint = renderScreen(
            makeBridge({
                // hand-published: a duplicate in another case
                published: JSON.stringify([
                    SIGNAL.toUpperCase(),
                    SIGNAL,
                    SAVERS,
                ]),
            }),
        )
        await screen.findByText('Morpheus Savers')

        await user.press(screen.getByTestId('autojoin-remove-1'))
        await user.press(screen.getByTestId('autojoin-confirm-remove'))

        await waitFor(() =>
            expect(
                fedimint.faClientUpdateFederationMetadata,
            ).toHaveBeenCalledWith(appSetting(JSON.stringify([SIGNAL]))),
        )
    })

    describe('a list published longer than ten', () => {
        const others = Array.from(
            { length: 10 },
            (_, i) => `fedi:community1space${i}`,
        )
        const twelve = [SIGNAL, SAVERS, ...others]

        it('should tell the admin to remove spaces and not open Add', async () => {
            renderScreen(makeBridge({ published: JSON.stringify(twelve) }))

            expect(
                await screen.findByText(
                    i18n.t(
                        'feature.wallet-service.settings-autojoin-over-limit',
                        { max: 10 },
                    ),
                ),
            ).toBeOnTheScreen()
            await user.press(screen.getByTestId('autojoin-add'))

            expect(
                screen.queryByTestId('autojoin-paste-input'),
            ).not.toBeOnTheScreen()
        })

        it('should save exactly the other eleven spaces on a remove', async () => {
            const fedimint = renderScreen(
                makeBridge({ published: JSON.stringify(twelve) }),
            )
            await screen.findByText('Morpheus Savers')

            await user.press(screen.getByTestId('autojoin-remove-1'))
            await user.press(screen.getByTestId('autojoin-confirm-remove'))

            await waitFor(() =>
                expect(
                    fedimint.faClientUpdateFederationMetadata,
                ).toHaveBeenCalledWith(
                    appSetting(JSON.stringify([SIGNAL, ...others])),
                ),
            )
            expect(
                fedimint.faClientUpdateFederationMetadata,
            ).toHaveBeenCalledTimes(1)
        })
    })

    describe('before the first read of the published list', () => {
        const renderUnread = (created: RpcCommunity[] = []) => {
            const fedimint = makeBridge({
                published: JSON.stringify([SIGNAL]),
                created,
            })
            jest.mocked(fedimint.federationPreview).mockImplementation(
                () => new Promise(() => {}),
            )
            return renderScreen(fedimint)
        }

        it('should not save a pasted space', async () => {
            const fedimint = renderUnread()
            jest.mocked(Clipboard.getString).mockResolvedValue(SAVERS)

            await user.press(screen.getByTestId('autojoin-add'))
            await user.press(
                await screen.findByTestId('autojoin-paste-clipboard'),
            )
            await screen.findByText(
                i18n.t('feature.wallet-service.settings-autojoin-found', {
                    name: 'Morpheus Savers',
                }),
            )
            await user.press(screen.getByTestId('autojoin-paste-confirm'))

            expect(
                fedimint.faClientUpdateFederationMetadata,
            ).not.toHaveBeenCalled()
        })

        it('should not save a picked space', async () => {
            const fedimint = renderUnread([
                community(SAVERS, 'Morpheus Savers'),
            ])

            await user.press(screen.getByTestId('autojoin-add'))
            await user.press(await screen.findByTestId('autojoin-pick-0'))
            await user.press(screen.getByTestId('autojoin-add-confirm'))

            expect(
                fedimint.faClientUpdateFederationMetadata,
            ).not.toHaveBeenCalled()
        })
    })

    it('should not ask again for a failed preview when the list changes', async () => {
        const fedimint = renderScreen(
            makeBridge({ published: JSON.stringify([GONE, SIGNAL]) }),
        )
        await screen.findByText('Signal in the Noise')
        await screen.findByText(
            i18n.t('feature.wallet-service.settings-autojoin-not-found'),
        )

        await user.press(screen.getByTestId('autojoin-remove-1'))
        await user.press(screen.getByTestId('autojoin-confirm-remove'))
        await waitFor(() =>
            expect(
                screen.queryByText('Signal in the Noise'),
            ).not.toBeOnTheScreen(),
        )

        expect(fedimint.faClientUpdateFederationMetadata).toHaveBeenCalledWith(
            appSetting(JSON.stringify([GONE])),
        )
        expect(fedimint.communityPreview).toHaveBeenCalledWith({
            inviteCode: GONE,
        })
        expect(
            jest
                .mocked(fedimint.communityPreview)
                .mock.calls.filter(([args]) => args.inviteCode === GONE),
        ).toHaveLength(1)
    })

    it('should not offer Add once ten spaces are linked', async () => {
        renderScreen(
            makeBridge({
                published: JSON.stringify(
                    Array.from(
                        { length: 10 },
                        (_, i) => `fedi:community1space${i}`,
                    ),
                ),
            }),
        )

        await waitFor(() =>
            expect(screen.getByTestId('autojoin-add')).toBeDisabled(),
        )
    })

    it('should save the list without a removed space', async () => {
        const fedimint = renderScreen(
            makeBridge({ published: JSON.stringify([SIGNAL, SAVERS]) }),
        )
        await screen.findByText('Morpheus Savers')

        await user.press(screen.getByTestId('autojoin-remove-0'))
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.settings-autojoin-remove-body'),
            ),
        ).toBeOnTheScreen()
        await user.press(screen.getByTestId('autojoin-confirm-remove'))

        await waitFor(() =>
            expect(
                fedimint.faClientUpdateFederationMetadata,
            ).toHaveBeenCalledWith(appSetting(JSON.stringify([SAVERS]))),
        )
        expect(fedimint.faClientUpdateFederationMetadata).toHaveBeenCalledTimes(
            1,
        )
    })

    describe('pasting a code', () => {
        // with no created spaces, Add opens the paste step directly
        const openPaste = async () => {
            await user.press(screen.getByTestId('autojoin-add'))
            return screen.findByTestId('autojoin-paste-input')
        }

        const pasteCode = async (code: string) => {
            jest.mocked(Clipboard.getString).mockResolvedValue(code)
            await openPaste()
            await user.press(screen.getByTestId('autojoin-paste-clipboard'))
        }

        const typeText = async (text: string) => {
            fireEvent.changeText(await openPaste(), text)
        }

        it('should preview a pasted space and save it', async () => {
            const fedimint = renderScreen()
            await waitFor(() =>
                expect(fedimint.federationPreview).toHaveBeenCalled(),
            )

            await pasteCode(SAVERS.toUpperCase())

            expect(
                await screen.findByText(
                    i18n.t('feature.wallet-service.settings-autojoin-found', {
                        name: 'Morpheus Savers',
                    }),
                ),
            ).toBeOnTheScreen()
            expect(
                screen.getByTestId('autojoin-paste-input'),
            ).toHaveDisplayValue(SAVERS.toUpperCase())
            await user.press(screen.getByTestId('autojoin-paste-confirm'))

            await waitFor(() =>
                expect(
                    fedimint.faClientUpdateFederationMetadata,
                ).toHaveBeenCalledWith(appSetting(JSON.stringify([SAVERS]))),
            )
        })

        it('should save only the space code from a join-then-join link', async () => {
            const fedimint = renderScreen()
            await waitFor(() =>
                expect(fedimint.federationPreview).toHaveBeenCalled(),
            )

            await typeText(
                `Join here: https://app.fedi.xyz/link#screen=join-then-join&federation=${FEDERATION_CODE}&community=${stripFediPrefix(SAVERS)}`,
            )

            await screen.findByText(
                i18n.t('feature.wallet-service.settings-autojoin-found', {
                    name: 'Morpheus Savers',
                }),
            )
            expect(fedimint.communityPreview).toHaveBeenCalledWith({
                inviteCode: SAVERS,
            })
            await user.press(screen.getByTestId('autojoin-paste-confirm'))

            await waitFor(() =>
                expect(
                    fedimint.faClientUpdateFederationMetadata,
                ).toHaveBeenCalledWith(appSetting(JSON.stringify([SAVERS]))),
            )
            expect(
                fedimint.faClientUpdateFederationMetadata,
            ).toHaveBeenCalledTimes(1)
        })

        it('should ask again for a failed preview when the code is pasted again', async () => {
            const fedimint = renderScreen()
            await waitFor(() =>
                expect(fedimint.federationPreview).toHaveBeenCalled(),
            )

            await typeText(UNKNOWN)
            await screen.findByText(
                i18n.t('feature.wallet-service.settings-autojoin-not-found'),
            )
            fireEvent.changeText(
                screen.getByTestId('autojoin-paste-input'),
                ` ${UNKNOWN} `,
            )

            await waitFor(() =>
                expect(fedimint.communityPreview).toHaveBeenCalledTimes(2),
            )
            expect(fedimint.communityPreview).toHaveBeenLastCalledWith({
                inviteCode: UNKNOWN,
            })
        })

        it('should refuse a Federation invite code', async () => {
            const fedimint = renderScreen()
            await waitFor(() =>
                expect(fedimint.federationPreview).toHaveBeenCalled(),
            )

            fedimint.joinFederation = jest.fn()
            fedimint.joinCommunity = jest.fn()

            await pasteCode(FEDERATION_CODE)

            expect(
                await screen.findByText(
                    i18n.t(
                        'feature.wallet-service.settings-autojoin-wrong-type',
                    ),
                ),
            ).toBeOnTheScreen()
            expect(screen.getByTestId('autojoin-paste-confirm')).toBeDisabled()
            expect(fedimint.communityPreview).not.toHaveBeenCalled()
            expect(
                fedimint.faClientUpdateFederationMetadata,
            ).not.toHaveBeenCalled()
            expect(fedimint.joinFederation).not.toHaveBeenCalled()
            expect(fedimint.joinCommunity).not.toHaveBeenCalled()
        })

        it('should refuse text with no space code in it', async () => {
            const fedimint = renderScreen()
            await waitFor(() =>
                expect(fedimint.federationPreview).toHaveBeenCalled(),
            )

            await typeText('hello')

            expect(
                await screen.findByText(
                    i18n.t('feature.wallet-service.settings-autojoin-no-code'),
                ),
            ).toBeOnTheScreen()
            expect(screen.getByTestId('autojoin-paste-confirm')).toBeDisabled()
            expect(fedimint.communityPreview).not.toHaveBeenCalled()
        })

        it('should clear the result when the field is emptied', async () => {
            const fedimint = renderScreen()
            await waitFor(() =>
                expect(fedimint.federationPreview).toHaveBeenCalled(),
            )
            await typeText(FEDERATION_CODE)
            await screen.findByTestId('autojoin-paste-message')

            fireEvent.changeText(screen.getByTestId('autojoin-paste-input'), '')

            expect(
                screen.queryByTestId('autojoin-paste-message'),
            ).not.toBeOnTheScreen()
            expect(screen.getByTestId('autojoin-paste-confirm')).toBeDisabled()
        })

        it('should offer the picker first when the admin created spaces', async () => {
            renderScreen(
                makeBridge({
                    created: [community(SIGNAL, 'Signal in the Noise')],
                }),
            )
            await user.press(screen.getByTestId('autojoin-add'))

            expect(
                await screen.findByTestId('autojoin-paste'),
            ).toBeOnTheScreen()
            expect(
                screen.queryByTestId('autojoin-paste-input'),
            ).not.toBeOnTheScreen()
        })

        it('should refuse a space that is already linked', async () => {
            const fedimint = renderScreen(
                makeBridge({ published: JSON.stringify([SIGNAL]) }),
            )
            await screen.findByText('Signal in the Noise')

            await pasteCode(SIGNAL.toUpperCase())

            expect(
                await screen.findByText(
                    i18n.t(
                        'feature.wallet-service.settings-autojoin-duplicate',
                    ),
                ),
            ).toBeOnTheScreen()
            expect(screen.getByTestId('autojoin-paste-confirm')).toBeDisabled()
            await user.press(screen.getByTestId('autojoin-paste-confirm'))
            expect(
                fedimint.faClientUpdateFederationMetadata,
            ).not.toHaveBeenCalled()
        })
    })

    it('should ask for a guardian update, with no success toast, when guardians cannot take the change', async () => {
        const fedimint = renderScreen(
            makeBridge({
                published: JSON.stringify([SIGNAL, SAVERS]),
                update: {
                    type: 'error',
                    error: {
                        code: 'maintenanceRejected',
                        message: 'unsupported',
                        detail: { type: 'maintenanceUnsupported' },
                    },
                },
            }),
        )
        await screen.findByText('Morpheus Savers')

        await user.press(screen.getByTestId('autojoin-remove-1'))
        await user.press(screen.getByTestId('autojoin-confirm-remove'))

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.settings-autojoin-update-title'),
            ),
        ).toBeOnTheScreen()
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.error-guardians-need-update'),
            ),
        ).toBeOnTheScreen()
        expect(mockToast.show).not.toHaveBeenCalled()
        // the list is unchanged: nothing was saved
        expect(screen.getByText('Morpheus Savers')).toBeOnTheScreen()

        await user.press(screen.getByTestId('autojoin-retry'))

        await waitFor(() =>
            expect(
                fedimint.faClientUpdateFederationMetadata,
            ).toHaveBeenCalledTimes(2),
        )
        expect(
            fedimint.faClientUpdateFederationMetadata,
        ).toHaveBeenLastCalledWith(appSetting(JSON.stringify([SIGNAL])))
    })

    it('should report another failure without the guardian update title', async () => {
        renderScreen(
            makeBridge({
                published: JSON.stringify([SIGNAL]),
                update: {
                    type: 'error',
                    error: {
                        code: 'busy',
                        message: 'busy',
                        detail: null,
                    },
                },
            }),
        )
        await screen.findByText('Signal in the Noise')

        await user.press(screen.getByTestId('autojoin-remove-0'))
        await user.press(screen.getByTestId('autojoin-confirm-remove'))

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.error-busy'),
            ),
        ).toBeOnTheScreen()
        expect(
            screen.queryByText(
                i18n.t('feature.wallet-service.settings-autojoin-update-title'),
            ),
        ).toBeNull()
        expect(mockToast.show).not.toHaveBeenCalled()
    })
})
