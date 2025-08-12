import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ChatMediaThumbnail } from '../../../components/Chat/ChatMediaThumbnail'

const drawImageToCanvasSpy = jest.fn()
const drawVideoToCanvasSpy = jest.fn()
jest.mock('../../../utils/media', () => ({
    ...jest.requireActual('../../../utils/media'),
    drawImageToCanvas: () => drawImageToCanvasSpy(),
    drawVideoToCanvas: () => drawVideoToCanvasSpy(),
}))

describe('/components/Chat/ChatImageEvent', () => {
    const mockImageFile = {
        type: 'image/png',
    } as File

    const mockVideoFile = {
        type: 'video/mp4',
    } as File

    afterEach(() => {
        jest.clearAllMocks()
    })

    describe('when the component is passed an image file', () => {
        it('should render an image thumbnail', async () => {
            render(
                <ChatMediaThumbnail file={mockImageFile} onRemove={() => {}} />,
            )

            await waitFor(() => {
                const image = screen.getByAltText('image-thumbnail')
                expect(image).toBeInTheDocument()
            })
        })
    })

    describe('when the component is passed a video file', () => {
        it('should render a video thumbnail', async () => {
            render(
                <ChatMediaThumbnail file={mockVideoFile} onRemove={() => {}} />,
            )

            await waitFor(() => {
                const video = screen.getByLabelText('video-thumbnail')
                expect(video).toBeInTheDocument()
            })
        })
    })

    describe('when the remove button is clicked', () => {
        it('should call the onRemove function', async () => {
            const onRemoveSpy = jest.fn()

            render(
                <ChatMediaThumbnail
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
