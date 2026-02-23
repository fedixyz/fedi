import { CompleteRecoveryAssist } from './CompleteRecoveryAssist'
import { ScanSocialRecoveryCode } from './ScanSocialRecoveryCode'
import { StartRecoveryAssistPage } from './StartRecoveryAssist'

interface Props {
    step?: string
}

export const GuardianAssist: React.FC<Props> = ({ step }) => {
    switch (step) {
        case 'scan':
            return <ScanSocialRecoveryCode />
        case 'complete':
            return <CompleteRecoveryAssist />
        default:
            return <StartRecoveryAssistPage />
    }
}
