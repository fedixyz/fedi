import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'

import { mockMatrixEventVideo } from '@fedi/common/tests/mock-data/matrix-event'

import { ChatVideoEvent } from '../../../components/Chat/ChatVideoEvent'

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

            await waitFor(() => {
                const video = screen.getByLabelText('video')

                video.click()
                expect(screen.getByRole('dialog')).toBeInTheDocument()
            })
        })
    })
})
