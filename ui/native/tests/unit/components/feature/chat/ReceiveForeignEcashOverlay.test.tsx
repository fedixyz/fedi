import { fireEvent, screen } from '@testing-library/react-native'
import React from 'react'

import { useAcceptForeignEcash } from '@fedi/common/hooks/chat'
import { createMockPaymentEvent } from '@fedi/common/tests/mock-data/matrix-event'
import { RpcFederationPreview } from '@fedi/common/types/bindings'
import i18n from '@fedi/native/localization/i18n'

import ReceiveForeignEcashOverlay from '../../../../../components/feature/chat/ReceiveForeignEcashOverlay'
import { renderWithProviders } from '../../../../utils/render'

jest.mock('@fedi/common/hooks/chat', () => ({
    useAcceptForeignEcash: jest.fn(),
}))

jest.mock('../../../../../components/ui/SvgImage', () => {
    const { Text: RNText } = jest.requireActual('react-native')
    return {
        __esModule: true,
        default: ({ name }: { name: string }) => <RNText>{name}</RNText>,
        SvgImageSize: { xs: 'xs', sm: 'sm', md: 'md', lg: 'lg' },
    }
})

const mockUseAcceptForeignEcash = jest.mocked(useAcceptForeignEcash)

const preview: RpcFederationPreview = {
    id: 'foreign-federation',
    name: 'Foreign Federation',
    inviteCode: 'fed1foreigninvite',
    meta: {},
    returningMemberStatus: { type: 'newMember' },
}

type HookState = ReturnType<typeof useAcceptForeignEcash>

const baseState: HookState = {
    isJoining: false,
    isLoading: false,
    federationPreview: undefined,
    handleJoin: jest.fn(),
    showFederationPreview: false,
    setShowFederationPreview: jest.fn(),
    hideOtherMethods: true,
    setHideOtherMethods: jest.fn(),
    issue: null,
    issueMessage: null,
    canRetry: false,
    retry: jest.fn(),
}

function renderOverlay(state: Partial<HookState>) {
    const hookState = { ...baseState, ...state }
    mockUseAcceptForeignEcash.mockReturnValue(hookState)
    renderWithProviders(
        <ReceiveForeignEcashOverlay
            paymentEvent={createMockPaymentEvent({
                content: { ecash: 'foreign-ecash' },
            })}
            show
            onDismiss={jest.fn()}
            onRejected={jest.fn()}
        />,
    )
    return hookState
}

describe('ReceiveForeignEcashOverlay', () => {
    it('offers to join the federation when the preview loads', () => {
        renderOverlay({ federationPreview: preview })

        expect(
            screen.getByText(i18n.t('feature.receive.join-new-federation')),
        ).toBeOnTheScreen()
        expect(
            screen.queryByText(i18n.t('errors.unknown-ecash-issuer')),
        ).toBeNull()
    })

    it('explains an unreachable federation and retries on press', () => {
        const state = renderOverlay({
            issue: 'unreachable',
            issueMessage: i18n.t('feature.receive.foreign-ecash-unreachable'),
            canRetry: true,
        })

        expect(
            screen.getByText(
                i18n.t('feature.receive.foreign-ecash-unreachable'),
            ),
        ).toBeOnTheScreen()
        expect(
            screen.queryByText(i18n.t('errors.unknown-ecash-issuer')),
        ).toBeNull()

        fireEvent.press(screen.getByText(i18n.t('words.retry')))
        expect(state.retry).toHaveBeenCalledTimes(1)
    })

    it('asks for an invite without offering a retry', () => {
        renderOverlay({
            issue: 'no-invite',
            issueMessage: i18n.t('feature.receive.foreign-ecash-no-invite'),
        })

        expect(
            screen.getByText(i18n.t('feature.receive.foreign-ecash-no-invite')),
        ).toBeOnTheScreen()
        expect(screen.queryByText(i18n.t('words.retry'))).toBeNull()
    })
})
