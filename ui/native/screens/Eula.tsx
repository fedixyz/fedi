import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import React, { MutableRefObject, useRef } from 'react'
import { WebView } from 'react-native-webview'

import { EULA_URL } from '@fedi/common/constants/tos'

import Flex from '../components/ui/Flex'
import type { RootStackParamList } from '../types/navigation'

export type Props = BottomTabScreenProps<RootStackParamList, 'Eula'>

const Eula: React.FC<Props> = () => {
    const webview = useRef<WebView>() as MutableRefObject<WebView>

    return (
        <Flex grow>
            <WebView
                ref={webview}
                source={{ uri: EULA_URL }}
                style={{ width: '100%', height: '100%', flex: 1 }}
            />
        </Flex>
    )
}

export default Eula
