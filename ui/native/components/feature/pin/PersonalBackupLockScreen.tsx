import FeatureLockScreen, { Props } from '../../../screens/FeatureLockScreen'
import { RootStackParamList } from '../../../types/navigation'

export default function PersonalBackupLockScreen(props: Props) {
    return (
        <FeatureLockScreen
            {...props}
            feature="personalBackup"
            screen={[
                'RecoveryWords',
                props.route.params as RootStackParamList['RecoveryWords'],
            ]}
        />
    )
}
