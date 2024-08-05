import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import React, { MutableRefObject, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'

import { EULA_URL } from '@fedi/common/constants/tos'

import type { RootStackParamList } from '../types/navigation'

export type Props = BottomTabScreenProps<RootStackParamList, 'Eula'>

const Eula: React.FC<Props> = () => {
    const webview = useRef<WebView>() as MutableRefObject<WebView>

    return (
        <View style={styles.container}>
            <WebView
                ref={webview}
                source={{ uri: EULA_URL }}
                style={{ width: '100%', height: '100%', flex: 1 }}
            />
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        // This is needed to shift the webview upwards to hide the back
        // button at the top of fedi.xyz
        marginTop: -50,
    },
})

export default Eula
