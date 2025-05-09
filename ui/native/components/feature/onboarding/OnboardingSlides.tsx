import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs'
import { EventMapBase, NavigationState } from '@react-navigation/native'
import React from 'react'
import { useTranslation } from 'react-i18next'

import HoloGuidance from '../../ui/HoloGuidance'
import SvgImage, { SvgImageName, SvgImageSize } from '../../ui/SvgImage'

type OnboardingSlideProps = {
    title: string
    message: string
    iconImageName: SvgImageName
}

const OnboardingSlide: React.FC<OnboardingSlideProps> = ({
    title,
    message,
    iconImageName,
}: OnboardingSlideProps) => {
    return (
        <HoloGuidance
            iconImage={<SvgImage name={iconImageName} size={SvgImageSize.lg} />}
            title={title}
            message={message}
        />
    )
}

export type OnboardingSlidesParamList = {
    Slide1: OnboardingSlideProps
    Slide2: OnboardingSlideProps
    Slide3: OnboardingSlideProps
    Slide4: OnboardingSlideProps
}

const Tab = createMaterialTopTabNavigator<OnboardingSlidesParamList>()

export type Props = {
    onSlideChanged: (page: number) => void
}

const OnboardingSlides: React.FC<Props> = ({ onSlideChanged }: Props) => {
    const { t } = useTranslation()

    const slides = [
        {
            key: 'welcome-to-fedi',
            title: t('feature.onboarding.fedi'),
            message: t('feature.onboarding.guidance-1'),
            iconImageName: 'FediLogoIcon' as SvgImageName,
        },
        {
            key: 'commmunity-first',
            title: t('feature.onboarding.community-first'),
            message: t('feature.onboarding.guidance-2'),
            iconImageName: 'SocialPeople' as SvgImageName,
        },
        {
            key: 'simple-and-private',
            title: t('feature.onboarding.simple-and-private'),
            message: t('feature.onboarding.guidance-3'),
            iconImageName: 'Fedimint' as SvgImageName,
        },
        {
            key: 'earn-and-save',
            title: t('feature.onboarding.earn-and-save'),
            message: t('feature.onboarding.guidance-4'),
            iconImageName: 'Cash' as SvgImageName,
        },
    ]

    return (
        <Tab.Navigator
            initialRouteName="Slide1"
            id="SplashTabs"
            screenListeners={{
                state: e => {
                    const eventData = e.data as EventMapBase
                    const state = eventData.state as NavigationState
                    onSlideChanged(state.index + 1)
                },
            }}
            screenOptions={() => ({
                tabBarStyle: { display: 'none' },
            })}>
            {slides.map((s, index) => (
                <Tab.Screen
                    key={s.key}
                    name={
                        `Slide${index + 1}` as keyof OnboardingSlidesParamList
                    }
                    initialParams={s}>
                    {props => <OnboardingSlide {...props} {...s} />}
                </Tab.Screen>
            ))}
        </Tab.Navigator>
    )
}

export default OnboardingSlides
