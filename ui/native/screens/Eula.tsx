import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import React, { useRef } from 'react'
import { WebView } from 'react-native-webview'

import { EULA_URL } from '@fedi/common/constants/tos'

import { Column } from '../components/ui/Flex'
import type { RootStackParamList } from '../types/navigation'

export type Props = BottomTabScreenProps<RootStackParamList, 'Eula'>

const Eula: React.FC<Props> = () => {
    const webview = useRef<WebView | null>(null)

    return (
        <Column grow>
            <WebView
                ref={webview}
                source={{ uri: EULA_URL }}
                style={{ width: '100%', height: '100%', flex: 1 }}
            />
        </Column>
    )
}

export default Eula
