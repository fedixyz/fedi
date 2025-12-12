import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { TotalBalance } from '../../../src/components/TotalBalance'
import i18n from '../../../src/localization/i18n'

const changeDisplayCurrencySpy = jest.fn()
jest.mock('@fedi/common/hooks/amount', () => ({
    useTotalBalance: () => ({
        shouldHideTotalBalance: false,
        formattedBalance: '100 sats',
        changeDisplayCurrency: changeDisplayCurrencySpy,
    }),
}))

describe('/components/TotalBalance', () => {
    const user = userEvent.setup()

    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('when the component is rendered', () => {
        it('should display formated balance', async () => {
            render(<TotalBalance />)

            const amount = screen.getByText(
                `${i18n.t('words.balance')}: 100 sats`,
            )
            expect(amount).toBeInTheDocument()
        })

        it('should display text values', async () => {
            render(<TotalBalance />)

            const component = screen.getByLabelText('Total Balance')
            user.click(component)

            await waitFor(() => {
                expect(changeDisplayCurrencySpy).toHaveBeenCalled()
            })
        })
    })
})
