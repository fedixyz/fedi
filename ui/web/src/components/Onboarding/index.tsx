import React from 'react'

import { styled } from '../../styles'
import { EnterDisplayName } from './EnterDisplayName'
import { JoinFederation } from './JoinFederation'
import { OnboardingComplete } from './OnboardingComplete'
import { OnboardingHome } from './OnboardingHome'
import { PersonalRecovery } from './PersonalRecovery'
import { SocialRecovery } from './SocialRecovery'
import { UploadAvatarImage } from './UploadAvatarImage'
import { WalletRecovery } from './WalletRecovery'

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
    } else if (step === 'username') {
        content = <EnterDisplayName />
    } else if (step === 'image') {
        content = <UploadAvatarImage />
    } else if (step === 'complete') {
        content = <OnboardingComplete />
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
