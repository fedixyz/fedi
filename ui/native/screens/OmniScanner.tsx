import { BottomTabScreenProps } from '@react-navigation/bottom-tabs'

import { OmniInput } from '../components/feature/omni/OmniInput'
import Flex from '../components/ui/Flex'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import { RootStackParamList, TabsNavigatorParamList } from '../types/navigation'

export type Props = BottomTabScreenProps<
    TabsNavigatorParamList & RootStackParamList,
    'OmniScanner'
>

const OmniScanner: React.FC<Props> = () => {
    return (
        <SafeAreaContainer edges={'bottom'}>
            <Flex grow fullWidth>
                <OmniInput
                    expectedInputTypes={[]}
                    onExpectedInput={() => null}
                    onUnexpectedSuccess={() => null}
                />
            </Flex>
        </SafeAreaContainer>
    )
}

export default OmniScanner
