import { useState } from 'react'

import { PressableIcon } from '../../ui/PressableIcon'
import StabilityInfoOverlay from './StabilityInfoOverlay'

export const StabilityInfoIcon = () => {
    const [isOpen, setIsOpen] = useState(false)
    return (
        <>
            <PressableIcon svgName="Info" onPress={() => setIsOpen(true)} />
            <StabilityInfoOverlay
                show={isOpen}
                onDismiss={() => setIsOpen(false)}
            />
        </>
    )
}
