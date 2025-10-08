import { Text, Button, useTheme } from '@rneui/themed'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import {
    shouldShowAnalyticsConsentModal,
    submitAnalyticsConsent,
} from '@fedi/common/redux/analytics'
import { AnalyticsVoteMethod } from '@fedi/common/types/analytics'

import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import CenterOverlay from '../../ui/CenterOverlay'
import Flex from '../../ui/Flex'
import HoloCircle from '../../ui/HoloCircle'
import SvgImage from '../../ui/SvgImage'

const AnalyticsConsentOverlay: React.FC = () => {
    const show = useAppSelector(shouldShowAnalyticsConsentModal)
    const dispatch = useAppDispatch()

    const { t } = useTranslation()
    const { theme } = useTheme()

    const handleConsent = useCallback(
        (consent: boolean, voteMethod: AnalyticsVoteMethod) => {
            dispatch(submitAnalyticsConsent({ consent, voteMethod }))
        },
        [dispatch],
    )

    return (
        <CenterOverlay
            show={show}
            onBackdropPress={() => handleConsent(false, 'modal-dismiss')}
            showCloseButton>
            <Flex gap="lg" align="center" fullWidth>
                <HoloCircle
                    size={64}
                    content={<SvgImage name="Bulb" size={48} />}
                />
                <Text h2 medium center>
                    {t('feature.support.analytics-consent-title')}
                </Text>
                <Text center color={theme.colors.darkGrey}>
                    {t('feature.support.analytics-consent-description')}
                </Text>
                <Flex gap="sm" fullWidth align="center">
                    <Button
                        onPress={() => handleConsent(true, 'modal-accept')}
                        fullWidth>
                        {t('words.sure')}
                    </Button>
                    <Button
                        onPress={() => handleConsent(false, 'modal-reject')}
                        fullWidth
                        text>
                        {t('phrases.not-now')}
                    </Button>
                </Flex>
            </Flex>
        </CenterOverlay>
    )
}

export default AnalyticsConsentOverlay
