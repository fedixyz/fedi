import {
    cleanup,
    fireEvent,
    screen,
    waitFor,
} from '@testing-library/react-native'
import React from 'react'

import { resources } from '@fedi/common/localization'
import { selectToast } from '@fedi/common/redux'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import { BridgeError } from '@fedi/common/utils/errors'
import i18n from '@fedi/native/localization/i18n'

import MessageInput from '../../../../../components/feature/chat/MessageInput'
import { renderWithProviders } from '../../../../utils/render'

jest.unmock('@fedi/common/hooks/toast')

const ROOM_ID = '!room:test.server'
const errorCases = [
    [
        'bridge connection failure',
        new BridgeError({
            error: 'client error (Connect)',
            detail: 'connection refused',
            errorCode: null,
        }),
    ],
    [
        'bridge bad request',
        new BridgeError({
            error: 'Bad request',
            detail: 'invalid Matrix user ID',
            errorCode: 'badRequest',
        }),
    ],
    ['JavaScript failure', new Error('attachment read failed')],
] as const

function renderInput(onMessageSubmitted: jest.Mock) {
    return renderWithProviders(
        <MessageInput
            id={ROOM_ID}
            isPublic={false}
            onMessageSubmitted={onMessageSubmitted}
        />,
        { fedimint: createMockFedimintBridge() },
    )
}

describe('MessageInput', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(async () => {
        cleanup()
        await i18n.changeLanguage('en')
    })

    it.each(
        errorCases.flatMap(([name, error]) =>
            (['en', 'es'] as const).map(
                language => [name, language, error] as const,
            ),
        ),
    )(
        'keeps the draft and translates a %s in %s',
        async (_name, language, error) => {
            await i18n.changeLanguage(language)
            const onMessageSubmitted = jest.fn().mockRejectedValue(error)
            const { store } = renderInput(onMessageSubmitted)

            fireEvent.changeText(
                screen.getByTestId('MessageInput-TextInput'),
                'hello',
            )
            fireEvent.press(screen.getByTestId('MessageInput-SendButton'))

            await waitFor(
                () => {
                    expect(selectToast(store.getState())).toMatchObject({
                        content:
                            resources[language].translation.errors[
                                'unknown-error'
                            ],
                        status: 'error',
                    })
                },
                { timeout: 1000 },
            )
            expect(onMessageSubmitted).toHaveBeenCalledTimes(1)
            expect(
                screen.getByTestId('MessageInput-TextInput').props.value,
            ).toBe('hello')
        },
    )

    it('clears the draft when the send succeeds', async () => {
        const onMessageSubmitted = jest.fn().mockResolvedValue(undefined)
        const { store } = renderInput(onMessageSubmitted)

        fireEvent.changeText(
            screen.getByTestId('MessageInput-TextInput'),
            'hello',
        )
        fireEvent.press(screen.getByTestId('MessageInput-SendButton'))

        await waitFor(() => {
            expect(
                screen.getByTestId('MessageInput-TextInput').props.value,
            ).toBe('')
        })
        expect(selectToast(store.getState())).toBeNull()
    })
})
