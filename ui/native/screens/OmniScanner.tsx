import { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import { useTranslation } from 'react-i18next'

import { useNuxStep } from '@fedi/common/hooks/nux'
import { selectOnboardingMethod } from '@fedi/common/redux'

import { OmniInput } from '../components/feature/omni/OmniInput'
import FirstTimeOverlay, {
    FirstTimeOverlayItem,
} from '../components/feature/onboarding/FirstTimeOverlay'
import { Column } from '../components/ui/Flex'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import { useAppSelector } from '../state/hooks'
import { RootStackParamList, TabsNavigatorParamList } from '../types/navigation'

export type Props = BottomTabScreenProps<
    TabsNavigatorParamList & RootStackParamList,
    'OmniScanner'
>

const OmniScanner: React.FC<Props> = () => {
    const { t } = useTranslation()

    const onboardingMethod = useAppSelector(selectOnboardingMethod)

    const [seenModal, completeSeenModal] = useNuxStep('scanModal')

    const show = !seenModal && onboardingMethod !== 'restored'

    const overlayItems: FirstTimeOverlayItem[] = [
        { icon: 'Scan', text: t('feature.omni.first-time-overlay-desc1') },
        { icon: 'Clipboard', text: t('feature.omni.first-time-overlay-desc2') },
    ]

    return (
        <>
            <SafeAreaContainer edges={'bottom'}>
                <Column grow fullWidth>
                    <OmniInput
                        expectedInputTypes={[]}
                        onExpectedInput={() => null}
                        onUnexpectedSuccess={() => null}
                    />
                </Column>
            </SafeAreaContainer>

            <FirstTimeOverlay
                overlayItems={overlayItems}
                title={t('feature.omni.first-time-overlay-title')}
                show={show}
                onDismiss={completeSeenModal}
                buttonLabel={t('feature.omni.first-time-overlay-buttonLabel')}
            />
        </>
    )
}

export default OmniScanner
