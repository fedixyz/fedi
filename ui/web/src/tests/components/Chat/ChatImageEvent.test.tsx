import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'

import { mockMatrixEventImage } from '@fedi/common/tests/mock-data/matrix-event'

import { ChatImageEvent } from '../../../components/Chat/ChatImageEvent'

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (i18nKey: string) => i18nKey,
    }),
}))

jest.mock('../../../hooks/media', () => ({
    ...jest.requireActual('../../../hooks/media'),
    useLoadMedia: () => ({
        src: '/test-url',
        loading: false,
        error: false,
    }),
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

            await waitFor(() => {
                const image = screen.getByAltText('image')

                image.click()
                expect(screen.getByRole('dialog')).toBeInTheDocument()
            })
        })
    })
})
