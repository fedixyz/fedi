import { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import { StyleSheet, View } from 'react-native'

import { OmniInput } from '../components/feature/omni/OmniInput'
import { RootStackParamList, TabsNavigatorParamList } from '../types/navigation'

export type Props = BottomTabScreenProps<
    TabsNavigatorParamList & RootStackParamList,
    'OmniScanner'
>

const OmniScanner: React.FC<Props> = () => {
    const style = styles()
    return (
        <View style={style.container}>
            <OmniInput
                expectedInputTypes={[]}
                onExpectedInput={() => null}
                onUnexpectedSuccess={() => null}
            />
        </View>
    )
}

const styles = () =>
    StyleSheet.create({
        container: {
            flex: 1,
            width: '100%',
        },
    })

export default OmniScanner
