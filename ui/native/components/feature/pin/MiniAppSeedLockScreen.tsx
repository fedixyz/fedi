import FeatureLockScreen, { Props } from '../../../screens/FeatureLockScreen'
import { RootStackParamList } from '../../../types/navigation'

export default function MiniAppSeedLockScreen(props: Props) {
    return (
        <FeatureLockScreen
            {...props}
            feature="miniAppSeed"
            screen={[
                'FediModBrowser',
                props.route.params as RootStackParamList['FediModBrowser'],
            ]}
        />
    )
}
