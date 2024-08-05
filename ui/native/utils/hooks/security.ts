import {
    ProtectedFeatures,
    selectIsFeatureUnlocked,
    selectProtectedFeatures,
} from '@fedi/common/redux'

import { usePinContext } from '../../state/contexts/PinContext'
import { useAppSelector } from '../../state/hooks'

/** Returns whether a pin-protected feature is unlocked or not. If a pin is not set or the feature is not pin-protected,
 * returns true */
export const useIsFeatureUnlocked = (feature: keyof ProtectedFeatures) => {
    const isFeatureUnlocked = useAppSelector(s =>
        selectIsFeatureUnlocked(s, feature),
    )
    const isFeatureProtected = useAppSelector(selectProtectedFeatures)[feature]
    const { status } = usePinContext()

    if (status === 'loading') return undefined

    if (status === 'unset') return true

    if (!isFeatureProtected) return true

    return isFeatureUnlocked
}
