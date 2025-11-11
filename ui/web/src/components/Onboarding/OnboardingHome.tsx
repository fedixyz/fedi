import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useGuardianito } from '@fedi/common/hooks/federation'
import { useNuxStep } from '@fedi/common/hooks/nux'
import { selectFederationIds } from '@fedi/common/redux'
import { ParserDataType } from '@fedi/common/types'

import { Button } from '../../components/Button'
import CreateFederation from '../../components/CreateFederation'
import * as Layout from '../../components/Layout'
import PublicFederations from '../../components/PublicFederations'
import { Switcher } from '../../components/Switcher'
import { Text } from '../../components/Text'
import {
    chatRoute,
    chatRoomRoute,
    federationsRoute,
    homeRoute,
    onboardingJoinRoute,
} from '../../constants/routes'
import { useAppSelector } from '../../hooks'
import { keyframes, styled, theme } from '../../styles'
import { OmniInput } from '../OmniInput'

type TabValue = 'discover' | 'join' | 'create'

type SwitcherOption = {
    label: string
    value: TabValue
}

const permittedTabs: string[] = ['discover', 'join', 'create']
const getTab = (tab: string): TabValue => {
    return permittedTabs.includes(tab) ? (tab as TabValue) : 'discover' // need this typecast
}

export function OnboardingHome() {
    const { t } = useTranslation()
    const { push, query, replace } = useRouter()

    const joinedFederationIds = useAppSelector(selectFederationIds)

    const [hasSeenDisplayNameModal] = useNuxStep('displayNameModal')

    const {
        myGuardianitoBot,
        beginBotCreation,
        isLoading: isLoadingGuardianitoBot,
        showGoToChatButton,
    } = useGuardianito(t)

    const [activeTab, setActiveTab] = useState<TabValue>('discover')

    const switcherOptions: SwitcherOption[] = [
        { label: t('words.discover'), value: 'discover' },
        { label: t('words.join'), value: 'join' },
        { label: t('words.create'), value: 'create' },
    ]

    // If a user has joined a federation, they should be taken to the federations page
    // If they have not, they should be taken to the home page
    const backRoute =
        joinedFederationIds.length > 0 ? federationsRoute : homeRoute

    useEffect(() => {
        if (query.tab) {
            setActiveTab(getTab(String(query.tab)))
        }
    }, [query.tab])

    const handleOnChange = (value: string) => {
        replace(`/onboarding?tab=${value}`)
    }

    const handleNavigation = (code: string) => {
        push(onboardingJoinRoute(code))
    }

    const handleContinue = async () => {
        // we need to call this before navigating in case the existing bot has been deleted
        // and a new one needs to be created. if one exists and is active this should be fast
        const bot = await beginBotCreation()
        if (bot) {
            push(chatRoomRoute(bot.bot_room_id))
        }
    }

    let body: React.ReactElement
    let actions: React.ReactElement | null = null

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
    } else if (activeTab === 'create') {
        body = <CreateFederation />

        actions = (
            <Layout.Actions>
                {myGuardianitoBot?.bot_room_id ? (
                    <Button
                        width="full"
                        loading={isLoadingGuardianitoBot}
                        onClick={handleContinue}>
                        {t('words.continue')}
                    </Button>
                ) : showGoToChatButton ? (
                    <Button width="full" onClick={() => push(chatRoute)}>
                        {t('phrases.go-to-chat')}
                    </Button>
                ) : isLoadingGuardianitoBot ? (
                    <Button width="full" disabled>
                        {`${t('phrases.please-wait')}...`}
                    </Button>
                ) : (
                    <Button width="full" onClick={beginBotCreation}>
                        {t('feature.onboarding.create-button-label')}
                    </Button>
                )}
            </Layout.Actions>
        )
    } else {
        body = <PublicFederations />
        actions = !hasSeenDisplayNameModal ? (
            <Layout.Actions>
                <Button
                    width="full"
                    variant="tertiary"
                    onClick={() => push(backRoute)}>
                    {t('phrases.maybe-later')}
                </Button>
            </Layout.Actions>
        ) : null
    }

    return (
        <Layout.Root>
            <Layout.Header
                centered
                back={hasSeenDisplayNameModal ? backRoute : false}>
                <Layout.Title subheader>
                    {t('feature.onboarding.heading')}
                </Layout.Title>
            </Layout.Header>
            <Layout.Content>
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
                                    : activeTab === 'create'
                                      ? 'feature.onboarding.description-create'
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
            </Layout.Content>
            {actions}
        </Layout.Root>
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
