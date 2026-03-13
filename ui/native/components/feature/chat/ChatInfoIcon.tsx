import { useState } from 'react'

import { PressableIcon } from '../../ui/PressableIcon'
import ChatInfoOverlay from './ChatInfoOverlay'

export const ChatInfoIcon = () => {
    const [isOpen, setIsOpen] = useState(false)
    return (
        <>
            <PressableIcon svgName="Info" onPress={() => setIsOpen(true)} />
            <ChatInfoOverlay show={isOpen} onDismiss={() => setIsOpen(false)} />
        </>
    )
}
