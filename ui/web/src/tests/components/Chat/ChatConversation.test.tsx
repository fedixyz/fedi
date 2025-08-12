import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ChatType } from '@fedi/common/types'

import { ChatConversation } from '../../../components/Chat/ChatConversation'

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (i18nKey: string) => i18nKey,
    }),
}))

jest.mock('../../../hooks/dom')
jest.mock('../../../hooks/store')

const onSendMessageSpy = jest.fn()

const commonProps = {
    type: ChatType.group,
    id: '1',
    name: 'name',
    events: [],
    onSendMessage: onSendMessageSpy,
    inputActions: false,
    onWalletClick: () => null,
    onPaginate: () => Promise.resolve(),
}

describe('/components/Chat/ChatConversation', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    describe('when the component is rendered', () => {
        it('should render the send button', async () => {
            render(<ChatConversation {...commonProps} inputActions />)

            await waitFor(() => {
                expect(screen.getByRole('button')).toBeInTheDocument()
            })
        })

        it('should render the input', async () => {
            render(<ChatConversation {...commonProps} />)

            await waitFor(() => {
                expect(screen.getByRole('textbox')).toBeInTheDocument()
            })
        })
    })

    describe('when the component is rendered without inputActions', () => {
        it('should not render the wallet or image buttons', async () => {
            render(<ChatConversation {...commonProps} />)

            await waitFor(() => {
                expect(
                    screen.queryByLabelText('wallet-icon'),
                ).not.toBeInTheDocument()

                expect(
                    screen.queryByLabelText('image-icon'),
                ).not.toBeInTheDocument()
            })
        })
    })

    describe('when the send button is clicked without typing into the input', () => {
        it('should not call the onSendMessage function', async () => {
            render(<ChatConversation {...commonProps} inputActions />)

            const button = screen.getByRole('button')
            userEvent.click(button)

            await waitFor(() => {
                expect(onSendMessageSpy).not.toHaveBeenCalled()
            })
        })
    })

    describe('when a message is typed into the input and the send button is clicked', () => {
        it('should call the onSendMessage function', async () => {
            render(<ChatConversation {...commonProps} inputActions />)

            const input = screen.getByRole('textbox')
            await userEvent.type(input, 'test')

            const button = screen.getByRole('button')
            userEvent.click(button)

            await waitFor(() => {
                expect(onSendMessageSpy).toHaveBeenCalledWith('test', [])
            })
        })
    })

    describe('when an image is uploaded and the send button is clicked', () => {
        it('should call the onSendMessage function', async () => {
            render(<ChatConversation {...commonProps} inputActions />)

            const fileUpload = screen.getByTestId(
                'file-upload',
            ) as HTMLInputElement

            const file = new File(['test'], 'test.png', { type: 'image/png' })

            await userEvent.upload(fileUpload, file)

            expect(fileUpload.files?.length).toBe(1)

            const button = screen.getByRole('button')
            userEvent.click(button)

            await waitFor(() => {
                expect(onSendMessageSpy).toHaveBeenCalledWith('', [file])
            })
        })
    })
})
