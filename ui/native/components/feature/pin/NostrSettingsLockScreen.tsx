import FeatureLockScreen, { Props } from '../../../screens/FeatureLockScreen'

export default function NostrSettingsLockScreen(props: Props) {
    return (
        <FeatureLockScreen
            {...props}
            feature="nostrSettings"
            screen={['NostrSettings']}
        />
    )
}
