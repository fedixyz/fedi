import '@testing-library/jest-dom'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { useAcceptForeignEcash } from '@fedi/common/hooks/chat'
import { createMockPaymentEvent } from '@fedi/common/tests/mock-data/matrix-event'
import { RpcFederationPreview } from '@fedi/common/types/bindings'

import { ReceiveForeignEcashOverlay } from '../../../../src/components/Chat/ReceiveForeignEcashOverlay'
import i18n from '../../../../src/localization/i18n'
import { renderWithProviders } from '../../../utils/render'

jest.mock('@fedi/common/hooks/chat', () => ({
    useAcceptForeignEcash: jest.fn(),
}))

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
            open
            onOpenChange={jest.fn()}
            paymentEvent={createMockPaymentEvent({
                content: { ecash: 'foreign-ecash' },
            })}
            onRejected={jest.fn()}
        />,
    )
    return hookState
}

describe('ReceiveForeignEcashOverlay', () => {
    const user = userEvent.setup()

    it('offers to join the federation when the preview loads', () => {
        renderOverlay({ federationPreview: preview })

        expect(
            screen.getByText(i18n.t('feature.receive.join-new-federation')),
        ).toBeInTheDocument()
        expect(
            screen.queryByText(i18n.t('errors.unknown-ecash-issuer')),
        ).not.toBeInTheDocument()
    })

    it('explains an unreachable federation and retries on click', async () => {
        const state = renderOverlay({
            issue: 'unreachable',
            issueMessage: i18n.t('feature.receive.foreign-ecash-unreachable'),
            canRetry: true,
        })

        expect(
            screen.getByText(
                i18n.t('feature.receive.foreign-ecash-unreachable'),
            ),
        ).toBeInTheDocument()
        expect(
            screen.queryByText(i18n.t('errors.unknown-ecash-issuer')),
        ).not.toBeInTheDocument()

        await user.click(
            screen.getByRole('button', { name: i18n.t('words.retry') }),
        )
        expect(state.retry).toHaveBeenCalledTimes(1)
    })

    it('asks for an invite without offering a retry', () => {
        renderOverlay({
            issue: 'no-invite',
            issueMessage: i18n.t('feature.receive.foreign-ecash-no-invite'),
        })

        expect(
            screen.getByText(i18n.t('feature.receive.foreign-ecash-no-invite')),
        ).toBeInTheDocument()
        expect(
            screen.queryByRole('button', { name: i18n.t('words.retry') }),
        ).not.toBeInTheDocument()
    })
})
