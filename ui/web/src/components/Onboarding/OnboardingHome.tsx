import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ParserDataType } from '@fedi/common/types'

import { Button } from '../../components/Button'
import { Header, Title } from '../../components/Layout'
import PublicFederations from '../../components/PublicFederations'
import { Switcher } from '../../components/Switcher'
import { Text } from '../../components/Text'
import { keyframes, styled, theme } from '../../styles'
import { OmniInput } from '../OmniInput'
import {
    OnboardingActions,
    OnboardingContainer,
    OnboardingContent,
} from './components'

type TabValue = 'discover' | 'join' | 'create'

type SwitcherOption = {
    label: string
    value: TabValue
}

const permittedTabs: string[] = ['discover', 'join']
const getTab = (tab: string): TabValue => {
    return permittedTabs.includes(tab) ? (tab as TabValue) : 'discover' // need this typecast
}

export function OnboardingHome() {
    const { t } = useTranslation()
    const { push, query, replace } = useRouter()

    const [activeTab, setActiveTab] = useState<TabValue>('discover')

    const switcherOptions: SwitcherOption[] = [
        { label: t('words.discover'), value: 'discover' },
        { label: t('words.join'), value: 'join' },
        // { label: t('words.create'), value: 'create' }, // This will be used at a later date
    ]

    useEffect(() => {
        if (query.tab) {
            setActiveTab(getTab(String(query.tab)))
        }
    }, [query.tab])

    const handleOnChange = (value: string) => {
        replace(`/onboarding?tab=${value}`)
    }

    const handleNavigation = (code: string) => {
        push(`/onboarding/join?invite_code=${code}`)
    }

    let body: React.ReactElement

    if (activeTab === 'join') {
        body = (
            <OmniInputWrapper>
                <OmniInput
                    expectedInputTypes={[
                        ParserDataType.FedimintInvite,
                        ParserDataType.CommunityInvite,
                    ]}
                    onExpectedInput={({ data }) =>
                        handleNavigation(data.invite)
                    }
                    onUnexpectedSuccess={() => null}
                    customActions={['paste']}
                />
            </OmniInputWrapper>
        )
    } else {
        body = <PublicFederations />
    }

    return (
        <OnboardingContainer>
            <Header back>
                <Title subheader>{t('phrases.join-a-federation')}</Title>
            </Header>
            <OnboardingContent justify="start">
                <Content>
                    <TitleWrapper>
                        <Text variant="h2" css={{ marginBottom: 0 }}>
                            {t('feature.onboarding.title')}
                        </Text>
                        <Text
                            variant="caption"
                            css={{ color: theme.colors.darkGrey }}>
                            {t(
                                activeTab === 'join'
                                    ? 'feature.onboarding.description-join'
                                    : 'feature.onboarding.description',
                            )}
                        </Text>
                    </TitleWrapper>
                    <Switcher
                        options={switcherOptions}
                        onChange={handleOnChange}
                        selected={activeTab}
                    />
                    <Body>{body}</Body>
                </Content>
            </OnboardingContent>
            <OnboardingActions>
                <Button variant="tertiary" onClick={() => push('/home')}>
                    {t('phrases.maybe-later')}
                </Button>
            </OnboardingActions>
        </OnboardingContainer>
    )
}

const fadeIn = keyframes({
    '0%, 30%': { opacity: 0 },
    '100%': { opacity: 1 },
})

const Content = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    textAlign: 'center',
})

const TitleWrapper = styled('div', {})

const Body = styled('div', {
    animation: `${fadeIn} 1s ease`,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
})

const OmniInputWrapper = styled('div', {
    display: 'flex',
})
