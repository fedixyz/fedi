import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ChatAttachmentThumbnail } from '../../../../src/components/Chat/ChatAttachmentThumbnail'

const drawImageToCanvasSpy = jest.fn()
const drawVideoToCanvasSpy = jest.fn()
jest.mock('../../../../src/utils/media', () => ({
    ...jest.requireActual('../../../../src/utils/media'),
    drawImageToCanvas: () => drawImageToCanvasSpy(),
    drawVideoToCanvas: () => drawVideoToCanvasSpy(),
}))

const mockImageFile = {
    type: 'image/png',
} as File

const mockVideoFile = {
    type: 'video/mp4',
} as File

const mockPdfFile = {
    type: 'application/pdf',
} as File

describe('/components/Chat/ChatImageEvent', () => {
    afterEach(() => {
        jest.clearAllMocks()
    })

    describe('when the component is passed an image file', () => {
        it('should render an image thumbnail', async () => {
            render(
                <ChatAttachmentThumbnail
                    file={mockImageFile}
                    onRemove={() => {}}
                />,
            )

            const image = screen.getByAltText('image-thumbnail')
            expect(image).toBeInTheDocument()
        })
    })

    describe('when the component is passed a video file', () => {
        it('should render a video thumbnail', async () => {
            render(
                <ChatAttachmentThumbnail
                    file={mockVideoFile}
                    onRemove={() => {}}
                />,
            )

            const video = screen.getByLabelText('video-thumbnail')
            expect(video).toBeInTheDocument()
        })
    })

    describe('when the component is passed a pdf file', () => {
        it('should render a file thumbnail', async () => {
            render(
                <ChatAttachmentThumbnail
                    file={mockPdfFile}
                    onRemove={() => {}}
                />,
            )

            const file = screen.getByLabelText('file-thumbnail')
            expect(file).toBeInTheDocument()
        })
    })

    describe('when the remove button is clicked', () => {
        it('should call the onRemove function', async () => {
            const onRemoveSpy = jest.fn()

            render(
                <ChatAttachmentThumbnail
                    file={mockImageFile}
                    onRemove={onRemoveSpy}
                />,
            )

            const removeButton = screen.getByLabelText('remove-button')
            userEvent.click(removeButton)

            await waitFor(() => {
                expect(onRemoveSpy).toHaveBeenCalled()
            })
        })
    })
})
