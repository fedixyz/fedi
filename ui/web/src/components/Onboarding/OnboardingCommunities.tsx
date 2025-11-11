import Image from 'next/image'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import CommunityCreateImage from '@fedi/common/assets/images/community-create-graphic.png'
import BuildingIcon from '@fedi/common/assets/svgs/building.svg'
import ChatIcon from '@fedi/common/assets/svgs/chat.svg'
import ToolIcon from '@fedi/common/assets/svgs/tool.svg'
import { ParserDataType } from '@fedi/common/types'

import { onboardingJoinRoute } from '../../constants/routes'
import { keyframes, styled, theme } from '../../styles'
import { Button } from '../Button'
import { Icon } from '../Icon'
import * as Layout from '../Layout'
import { OmniInput } from '../OmniInput'
import PublicFederations from '../PublicFederations'
import { Switcher } from '../Switcher'
import { Text } from '../Text'

type TabValue = 'discover' | 'join' | 'create'

type SwitcherOption = {
    label: string
    value: TabValue
    subText: string
}

const permittedTabs: string[] = ['join', 'create']
const getTab = (tab: string): TabValue => {
    return permittedTabs.includes(tab) ? (tab as TabValue) : 'join' // need this typecast
}

// Add type and component for info entry list
type InfoEntryItem = {
    icon: React.FunctionComponent<React.SVGAttributes<SVGElement>>
    text: string
}

const InfoEntryList: React.FC<{ items: InfoEntryItem[] }> = ({ items }) => {
    return (
        <InfoListContainer>
            {items.map((item, index) => (
                <InfoEntryListItem key={index}>
                    <IconWrapper>
                        <Icon icon={item.icon} size="md" />
                    </IconWrapper>
                    <Text
                        variant="caption"
                        css={{
                            color: theme.colors.darkGrey,
                            textAlign: 'left',
                            flex: 1,
                        }}>
                        {item.text}
                    </Text>
                </InfoEntryListItem>
            ))}
        </InfoListContainer>
    )
}

export function OnboardingCommunities() {
    const { t } = useTranslation()
    const { push, query, replace } = useRouter()

    const [activeTab, setActiveTab] = useState<TabValue>('join')

    const switcherOptions: SwitcherOption[] = [
        // { label: t('words.discover'), value: 'discover' }, // This will be used at a later date
        {
            label: t('words.join'),
            value: 'join',
            subText: t('feature.communities.guidance-join'),
        },
        // TODO: uncomment when community generator v2 is ready
        // {
        //     label: t('words.create'),
        //     value: 'create',
        //     subText: t('feature.communities.guidance-discover'),
        // },
    ]

    const selectedOption =
        switcherOptions.find(opt => opt.value === activeTab) ??
        switcherOptions[0]

    // Add createInfoItems for the create tab
    const createInfoItems: InfoEntryItem[] = [
        { icon: BuildingIcon, text: t('feature.communities.create-info-1') },
        { icon: ChatIcon, text: t('feature.communities.create-info-2') },
        { icon: ToolIcon, text: t('feature.communities.create-info-3') },
    ]

    useEffect(() => {
        if (query.tab) {
            setActiveTab(getTab(String(query.tab)))
        }
    }, [query.tab])

    const handleOnChange = (value: string) => {
        replace(`/onboarding/communities?tab=${value}`)
    }

    const handleNavigation = (code: string) => {
        push(onboardingJoinRoute(code))
    }

    const handleCreateCommunity = () => {
        window.open(
            'https://support.fedi.xyz/hc/en-us/sections/18214787528082-Federation-Setup',
            '_blank',
        )
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
                    pasteLabel={t('feature.communities.paste-community-code')}
                />
            </OmniInputWrapper>
        )
    } else if (activeTab === 'create') {
        body = (
            <CreateContainer>
                <CreateContentWrapper>
                    <ImageWrapper>
                        <Image
                            src={CommunityCreateImage}
                            alt="Create Community"
                            style={{ width: '100%', height: 'auto' }}
                        />
                    </ImageWrapper>
                    <InfoEntryList items={createInfoItems} />
                </CreateContentWrapper>
                <CreateButtonContainer>
                    <Button width="full" onClick={handleCreateCommunity}>
                        {t('phrases.create-my-community')}
                    </Button>
                </CreateButtonContainer>
            </CreateContainer>
        )
    } else {
        body = <PublicFederations />
    }

    return (
        <Layout.Root>
            <Layout.Header centered back>
                <Layout.Title subheader>
                    {t('phrases.join-a-community')}
                </Layout.Title>
            </Layout.Header>
            <Layout.Content>
                <Content>
                    <TitleWrapper>
                        <Text variant="h2" css={{ marginBottom: 0 }}>
                            {t('feature.communities.onboarding-title')}
                        </Text>
                        <Text
                            variant="caption"
                            css={{ color: theme.colors.darkGrey }}>
                            {selectedOption.subText}
                        </Text>
                    </TitleWrapper>
                    {/* TODO: remove this check when either Discover or Create tabs are ready */}
                    {switcherOptions.length > 1 && (
                        <Switcher
                            options={switcherOptions}
                            onChange={handleOnChange}
                            selected={activeTab}
                        />
                    )}
                    <Body>{body}</Body>
                </Content>
            </Layout.Content>
            <Layout.Actions>
                <Button variant="tertiary" onClick={() => push('/home')}>
                    {t('phrases.maybe-later')}
                </Button>
            </Layout.Actions>
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

const CreateContainer = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
})

const CreateContentWrapper = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    flex: 1,
})

const ImageWrapper = styled('div', {
    maxWidth: '100%',
    height: 'auto',
})

const InfoListContainer = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
})

const InfoEntryListItem = styled('div', {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
})

const IconWrapper = styled('div', {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: theme.colors.night,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,

    '& svg': {
        color: theme.colors.white,
    },
})

const CreateButtonContainer = styled('div', {
    display: 'flex',
})
