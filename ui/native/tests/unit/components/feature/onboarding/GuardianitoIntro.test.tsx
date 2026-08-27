import { cleanup, screen } from '@testing-library/react-native'
import React from 'react'

import i18n from '@fedi/native/localization/i18n'

import { GuardianitoIntro } from '../../../../../components/feature/onboarding/GuardianitoIntro'
import { renderWithProviders } from '../../../../utils/render'

// Icon identity is not asserted below: `SvgImage` takes no testID and the svg
// mock renders no distinguishing text, so the icon names are unreachable from a
// query.
describe('GuardianitoIntro', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('should keep all three explainer rows including the G-Bot claim', async () => {
        renderWithProviders(<GuardianitoIntro />)

        expect(
            await screen.findByText(i18n.t('feature.onboarding.create-info-1')),
        ).toBeOnTheScreen()
        expect(
            screen.getByText(i18n.t('feature.onboarding.create-info-3')),
        ).toBeOnTheScreen()
        expect(
            screen.getByText(i18n.t('feature.onboarding.create-info-5')),
        ).toBeOnTheScreen()
    })
})
