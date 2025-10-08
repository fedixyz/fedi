import React from 'react'

import { styled } from '../../styles'
import { JoinFederation } from './JoinFederation'
import { OnboardingCommunities } from './OnboardingCommunities'
import { OnboardingHome } from './OnboardingHome'
import { PersonalRecovery } from './PersonalRecovery'
import { SelectDevice } from './SelectDevice'
import { SocialRecovery } from './SocialRecovery'
import { WalletRecovery } from './WalletRecovery'
import { WalletTransfer } from './WalletTransfer'

interface Props {
    step?: string
}

export const Onboarding: React.FC<Props> = ({ step }) => {
    let content
    if (step === 'join') {
        content = <JoinFederation />
    } else if (step === 'recover') {
        content = <WalletRecovery />
    } else if (step === 'recover/personal') {
        content = <PersonalRecovery />
    } else if (step === 'recover/social') {
        content = <SocialRecovery />
    } else if (step === 'recover/wallet-transfer') {
        content = <WalletTransfer />
    } else if (step === 'recover/select-device') {
        content = <SelectDevice />
    } else if (step === 'communities') {
        content = <OnboardingCommunities />
    } else {
        content = <OnboardingHome />
    }

    return <Container>{content}</Container>
}

const Container = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minHeight: '60vh',
    textAlign: 'center',

    '@media (min-height: 1080px)': {
        minHeight: 640,
    },
})
