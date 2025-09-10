import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'

import { mockMatrixEventImage } from '@fedi/common/tests/mock-data/matrix-event'

import { ChatImageEvent } from '../../../src/components/Chat/ChatImageEvent'
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

describe('/components/Chat/ChatImageEvent', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('when the component is rendered', () => {
        it('should display image', async () => {
            render(<ChatImageEvent event={mockMatrixEventImage} />)

            await waitFor(() => {
                expect(screen.getByAltText('image')).toBeInTheDocument()
            })
        })
    })

    describe('when the image is clicked', () => {
        it('should open the dialog', async () => {
            render(<ChatImageEvent event={mockMatrixEventImage} />)

            const image = screen.getByAltText('image')

            await waitFor(() => {
                image.click()

                expect(screen.getByRole('dialog')).toBeInTheDocument()
            })
        })

        describe('when the user clicks the download button', () => {
            it('should call the download function', async () => {
                render(<ChatImageEvent event={mockMatrixEventImage} />)

                const image = screen.getByAltText('image')

                await waitFor(() => {
                    image.click()

                    const downloadButton =
                        screen.getByLabelText('download-button')
                    downloadButton.click()

                    expect(downloadFile).toHaveBeenCalled()
                })
            })
        })
    })
})
