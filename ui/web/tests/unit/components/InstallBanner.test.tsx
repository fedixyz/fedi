import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'

import { InstallBanner } from '../../../src/components/InstallBanner/index'

const onInstallSpy = jest.fn()
const onCloseSpy = jest.fn()

const commonProps = {
    title: 'title',
    description: 'description',
    buttonLabel: 'buttonLabel',
    onInstall: onInstallSpy,
    onClose: onCloseSpy,
}

describe('/components/InstallBanner', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('when the component is rendered', () => {
        it('should display text values', () => {
            render(<InstallBanner {...commonProps} />)

            const title = screen.getByText(commonProps.title)
            const description = screen.getByText(commonProps.description)
            const button = screen.getByText(commonProps.buttonLabel)

            expect(title).toBeInTheDocument()
            expect(description).toBeInTheDocument()
            expect(button).toBeInTheDocument()
        })

        it('should call onInstall when the button is clicked', () => {
            render(<InstallBanner {...commonProps} />)

            const button = screen.getByRole('button')
            button.click()

            expect(onInstallSpy).toHaveBeenCalled()
        })

        it('should call onClose when the close icon is clicked', () => {
            render(<InstallBanner {...commonProps} />)

            const closeButton = screen.getByLabelText('Close')
            closeButton.click()

            expect(onCloseSpy).toHaveBeenCalled()
        })
    })
})
