import { useRouter } from 'next/router'
import React from 'react'

import { ContentBlock } from '../../components/ContentBlock'
import { Onboarding } from '../../components/Onboarding'

const OnboardingPage: React.FC = () => {
    const { query, isReady } = useRouter()
    const step = Array.isArray(query.step) ? query.step.join('/') : query.step

    if (!isReady) return null

    return (
        <ContentBlock>
            <Onboarding step={step as string} />
        </ContentBlock>
    )
}

export default OnboardingPage
