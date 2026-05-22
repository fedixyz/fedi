import '@testing-library/jest-dom'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

import { setupStore } from '@fedi/common/redux'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'

import { ChatCreatePollDialog } from '../../../../src/components/Chat/ChatCreatePollDialog'
import i18n from '../../../../src/localization/i18n'
import { renderWithProviders } from '../../../utils/render'

const mockToastError = jest.fn()

jest.mock('@fedi/common/hooks/toast', () => ({
    useToast: () => ({
        error: mockToastError,
        show: jest.fn(),
        close: jest.fn(),
    }),
}))

const ROOM_ID = '!poll-room:example.com'

function renderDialog({
    fedimint = createMockFedimintBridge({
        matrixStartPoll: async () => undefined,
    }),
    store = setupStore(),
    onOpenChange = jest.fn(),
} = {}) {
    renderWithProviders(
        <ChatCreatePollDialog
            roomId={ROOM_ID}
            open
            onOpenChange={onOpenChange}
        />,
        { fedimint, store },
    )

    return { fedimint, store, onOpenChange }
}

async function fillPollForm() {
    await userEvent.type(
        screen.getByLabelText(i18n.t('words.question')),
        'Where should we meet?',
    )
    await userEvent.type(screen.getByLabelText('option-input-1'), 'Lobby')
    await userEvent.type(screen.getByLabelText('option-input-2'), 'Courtyard')
    await userEvent.type(screen.getByLabelText('option-input-3'), 'Cafe')
}

function optionInputs() {
    return screen.getAllByLabelText(/option-input-\d/)
}

function addButton() {
    return screen.getByRole('button', { name: i18n.t('words.add') })
}

function createButton() {
    return screen.getByRole('button', {
        name: i18n.t('feature.chat.create-poll'),
    })
}

describe('/components/Chat/ChatCreatePollDialog', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('should disable create until question and answers are filled', async () => {
        const { fedimint } = renderDialog()

        const createButton = screen.getByRole('button', {
            name: i18n.t('feature.chat.create-poll'),
        })
        await userEvent.click(createButton)
        expect(fedimint.matrixStartPoll).not.toHaveBeenCalled()

        await fillPollForm()

        await userEvent.click(createButton)
        await waitFor(() => {
            expect(fedimint.matrixStartPoll).toHaveBeenCalled()
        })
    })

    it('should keep create disabled for whitespace-only inputs', async () => {
        const { fedimint } = renderDialog()

        await userEvent.type(
            screen.getByLabelText(i18n.t('words.question')),
            '   ',
        )
        await userEvent.type(screen.getByLabelText('option-input-1'), '   ')
        await userEvent.type(screen.getByLabelText('option-input-2'), '   ')
        await userEvent.type(screen.getByLabelText('option-input-3'), '   ')

        await userEvent.click(createButton())
        expect(fedimint.matrixStartPoll).not.toHaveBeenCalled()
    })

    it('should trim submitted question and answer values', async () => {
        const fedimint = createMockFedimintBridge({
            matrixStartPoll: async () => undefined,
        })
        renderDialog({ fedimint })

        await userEvent.type(
            screen.getByLabelText(i18n.t('words.question')),
            '  Where should we meet?  ',
        )
        await userEvent.type(
            screen.getByLabelText('option-input-1'),
            '  Lobby  ',
        )
        await userEvent.type(
            screen.getByLabelText('option-input-2'),
            '  Courtyard  ',
        )
        await userEvent.type(
            screen.getByLabelText('option-input-3'),
            '  Cafe  ',
        )
        await userEvent.click(createButton())

        await waitFor(() => {
            expect(fedimint.matrixStartPoll).toHaveBeenCalledWith(
                ROOM_ID,
                'Where should we meet?',
                ['Lobby', 'Courtyard', 'Cafe'],
                false,
                true,
            )
        })
    })

    it('should add and remove answer fields within the option limits', async () => {
        renderDialog()

        expect(optionInputs()).toHaveLength(3)

        await userEvent.click(addButton())
        await userEvent.click(addButton())
        await userEvent.click(addButton())

        expect(optionInputs()).toHaveLength(6)
        await userEvent.click(addButton())
        expect(optionInputs()).toHaveLength(6)

        await userEvent.click(screen.getByLabelText('remove-option-1'))
        await userEvent.click(screen.getByLabelText('remove-option-1'))
        await userEvent.click(screen.getByLabelText('remove-option-1'))
        await userEvent.click(screen.getByLabelText('remove-option-1'))

        expect(optionInputs()).toHaveLength(2)
        await userEvent.click(screen.getByLabelText('remove-option-1'))
        expect(optionInputs()).toHaveLength(2)
    })

    it('should create a poll with the selected settings and close the dialog', async () => {
        const onOpenChange = jest.fn()
        const fedimint = createMockFedimintBridge({
            matrixStartPoll: async () => undefined,
        })
        renderDialog({ fedimint, onOpenChange })

        await fillPollForm()
        const [multiSelectSwitch, liveResultsSwitch] =
            screen.getAllByRole('switch')
        await userEvent.click(multiSelectSwitch)
        await userEvent.click(liveResultsSwitch)
        await userEvent.click(
            screen.getByRole('button', {
                name: i18n.t('feature.chat.create-poll'),
            }),
        )

        await waitFor(() => {
            expect(fedimint.matrixStartPoll).toHaveBeenCalledWith(
                ROOM_ID,
                'Where should we meet?',
                ['Lobby', 'Courtyard', 'Cafe'],
                true,
                false,
            )
            expect(onOpenChange).toHaveBeenCalledWith(false)
        })
    })

    it('should reset state between dialog sessions', async () => {
        const TestDialog = () => {
            const [open, setOpen] = useState(false)
            return (
                <>
                    <button onClick={() => setOpen(true)}>Open poll</button>
                    <ChatCreatePollDialog
                        roomId={ROOM_ID}
                        open={open}
                        onOpenChange={setOpen}
                    />
                </>
            )
        }

        renderWithProviders(<TestDialog />, {
            fedimint: createMockFedimintBridge({
                matrixStartPoll: async () => undefined,
            }),
            store: setupStore(),
        })

        await userEvent.click(screen.getByText('Open poll'))
        await userEvent.type(
            screen.getByLabelText(i18n.t('words.question')),
            'Where should we meet?',
        )
        await userEvent.type(screen.getByLabelText('option-input-1'), 'Lobby')
        await userEvent.click(screen.getByTestId('dialog-close-button'))
        await userEvent.click(screen.getByText('Open poll'))

        expect(screen.getByLabelText(i18n.t('words.question'))).toHaveValue('')
        expect(optionInputs()).toHaveLength(3)
        for (const input of optionInputs()) {
            expect(input).toHaveValue('')
        }
    })

    it('should block duplicate submits while a submit is in flight', async () => {
        const fedimint = createMockFedimintBridge({
            matrixStartPoll: jest.fn(() => new Promise(() => undefined)),
        })
        renderDialog({ fedimint })

        await fillPollForm()
        await userEvent.click(createButton())
        await userEvent.click(createButton())

        expect(fedimint.matrixStartPoll).toHaveBeenCalledTimes(1)
    })

    it('should show a toast when poll creation fails', async () => {
        const fedimint = createMockFedimintBridge({
            matrixStartPoll: async () => {
                throw new Error('create failed')
            },
        })
        renderDialog({ fedimint })

        await fillPollForm()
        await userEvent.click(
            screen.getByRole('button', {
                name: i18n.t('feature.chat.create-poll'),
            }),
        )

        await waitFor(() => {
            expect(mockToastError).toHaveBeenCalledWith(
                expect.any(Function),
                expect.any(Error),
                'errors.unknown-error',
            )
        })
    })
})
