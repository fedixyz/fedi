import { useRouter } from 'next/router'
import React from 'react'

import { GuardianAssist } from '../../../components/GuardianAssist'

const OnboardingPage: React.FC = () => {
    const { query, isReady } = useRouter()
    const step = Array.isArray(query.step) ? query.step.join('/') : query.step

    if (!isReady) return null

    return <GuardianAssist step={step as string} />
}

export default OnboardingPage
