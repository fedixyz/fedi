import { BottomTabScreenProps } from '@react-navigation/bottom-tabs'

import { OmniInput } from '../components/feature/omni/OmniInput'
import Flex from '../components/ui/Flex'
import { RootStackParamList, TabsNavigatorParamList } from '../types/navigation'

export type Props = BottomTabScreenProps<
    TabsNavigatorParamList & RootStackParamList,
    'OmniScanner'
>

const OmniScanner: React.FC<Props> = () => {
    return (
        <Flex grow fullWidth>
            <OmniInput
                expectedInputTypes={[]}
                onExpectedInput={() => null}
                onUnexpectedSuccess={() => null}
            />
        </Flex>
    )
}

export default OmniScanner
