import FeatureLockScreen, { Props } from '../../../screens/FeatureLockScreen'

export default function SetPinLockScreen(props: Props) {
    return (
        <FeatureLockScreen {...props} feature="changePin" screen={['SetPin']} />
    )
}
