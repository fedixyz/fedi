import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'

import { mockMatrixEventVideo } from '@fedi/common/tests/mock-data/matrix-event'

import { ChatVideoEvent } from '../../../src/components/Chat/ChatVideoEvent'
import { downloadFile } from '../../../src/utils/media'

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (i18nKey: string) => i18nKey,
    }),
}))

jest.mock('../../../src/hooks/media', () => ({
    ...jest.requireActual('../../../src/hooks/media'),
    useLoadMedia: () => ({
        src: '/test-url',
        loading: false,
        error: false,
    }),
}))

jest.mock('../../../src/utils/media', () => ({
    downloadFile: jest.fn(),
}))

describe('/components/Chat/ChatVideoEvent', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('when the component is rendered', () => {
        it('should display video', async () => {
            render(<ChatVideoEvent event={mockMatrixEventVideo} />)

            await waitFor(() => {
                expect(screen.getByLabelText('video')).toBeInTheDocument()
            })
        })
    })

    describe('when the video is clicked', () => {
        it('should open the dialog', async () => {
            render(<ChatVideoEvent event={mockMatrixEventVideo} />)

            const video = screen.getByLabelText('video')

            await waitFor(() => {
                video.click()

                expect(screen.getByRole('dialog')).toBeInTheDocument()
            })
        })

        describe('when the user clicks the download button', () => {
            it('should call the download function', async () => {
                render(<ChatVideoEvent event={mockMatrixEventVideo} />)

                const video = screen.getByLabelText('video')

                await waitFor(() => {
                    video.click()

                    const downloadButton =
                        screen.getByLabelText('download-button')
                    downloadButton.click()

                    expect(downloadFile).toHaveBeenCalled()
                })
            })
        })
    })
})
