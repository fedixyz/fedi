import { cleanup, screen } from '@testing-library/react-native'
import React from 'react'

import i18n from '@fedi/native/localization/i18n'

import { WalletServiceIntro } from '../../../../../components/feature/walletservice/WalletServiceIntro'
import { renderWithProviders } from '../../../../utils/render'

// Icon identity is not asserted anywhere below: `SvgImage` takes no testID and
// the svg mock renders no distinguishing text, so `SocialPeople` and
// `ShieldHalfFilled` are unreachable from a query. Verified against
// fedi-docs/wallet-service-user-stories/assets/01_state_create.png by eye.
describe('WalletServiceIntro', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('should describe guardians with two rows', async () => {
        renderWithProviders(<WalletServiceIntro />)

        expect(
            await screen.findByText(i18n.t('feature.onboarding.create-info-1')),
        ).toBeOnTheScreen()
        expect(
            screen.getByText(i18n.t('feature.onboarding.create-info-3')),
        ).toBeOnTheScreen()
    })

    it('should leave the G-Bot claim to the legacy create path', async () => {
        renderWithProviders(<WalletServiceIntro />)

        expect(
            await screen.findByText(i18n.t('feature.onboarding.create-info-1')),
        ).toBeOnTheScreen()
        expect(
            screen.queryByText(i18n.t('feature.onboarding.create-info-5')),
        ).not.toBeOnTheScreen()
    })
})
