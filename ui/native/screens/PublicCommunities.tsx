import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme, Image } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, View } from 'react-native'

import { useLatestPublicCommunities } from '@fedi/common/hooks/federation'
import { selectCommunityIds } from '@fedi/common/redux'
import { isDev, isNightly } from '@fedi/common/utils/environment'
import { Images } from '@fedi/native/assets/images'

import { FederationLogo } from '../components/feature/federations/FederationLogo'
import InfoEntryList from '../components/feature/home/InfoEntryList'
import { Switcher } from '../components/feature/home/Switcher'
import { OmniInput } from '../components/feature/omni/OmniInput'
import { FirstTimeOverlayItem } from '../components/feature/onboarding/FirstTimeOverlay'
import Flex from '../components/ui/Flex'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import {
    COMMUNITY_TOOL_URL_STAGING,
    COMMUNITY_TOOL_URL_PROD,
} from '../constants'
import { useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'PublicCommunities'
>
const PublicCommunities: React.FC<Props> = ({ navigation }) => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    const { isFetchingPublicCommunities } = useLatestPublicCommunities()
    const joinedCommunityIds = useAppSelector(selectCommunityIds)
    const publicCommunities = useAppSelector(
        s => s.federation.publicCommunities,
    )

    const style = styles(theme)

    type Tab = 'discover' | 'join' | 'create'

    const [activeTab, setActiveTab] = useState<Tab | null>(null)

    useEffect(() => {
        if (isFetchingPublicCommunities && publicCommunities.length === 0)
            return
        setActiveTab(publicCommunities.length > 0 ? 'discover' : 'join')
    }, [isFetchingPublicCommunities, publicCommunities])

    const switcherOptions: Array<{
        label: string
        value: Tab
        subText: string
    }> = []

    if (publicCommunities.length > 0) {
        switcherOptions.push({
            label: t('words.discover'),
            value: 'discover',
            subText: t('feature.communities.guidance-discover'),
        })
    }

    switcherOptions.push({
        label: t('words.join'),
        value: 'join',
        subText: t('feature.communities.guidance-join'),
    })

    // Include when create community is implemented
    switcherOptions.push({
        label: t('words.create'),
        value: 'create',
        subText: t('feature.onboarding.description-create-community'),
    })

    const selectedOption =
        switcherOptions.find(opt => opt.value === activeTab) ??
        switcherOptions[0]

    const createInfoItems: FirstTimeOverlayItem[] = [
        { icon: 'Community', text: t('feature.communities.create-info-1') },
        {
            icon: 'Chat',
            text: t('feature.communities.create-info-2'),
        },
        { icon: 'Tool', text: t('feature.communities.create-info-3') },
    ]

    if (!activeTab) return null

    return (
        <SafeAreaContainer edges="bottom">
            <Flex
                align="center"
                justify="evenly"
                gap="sm"
                fullWidth
                style={style.titleContainer}>
                <Text h2 medium h2Style={style.title}>
                    {t('feature.communities.onboarding-title')}
                </Text>
                <Text
                    medium
                    style={{
                        color: theme.colors.darkGrey,
                        textAlign: 'center',
                        paddingLeft: 10,
                        paddingRight: 10,
                        paddingBottom: 10,
                    }}>
                    {selectedOption.subText}
                </Text>
            </Flex>

            {/* Only show the switcher if there's more than one option */}
            {switcherOptions.length > 1 && (
                <View style={style.switcherContainer}>
                    <Switcher<Tab>
                        options={switcherOptions}
                        selected={activeTab}
                        onChange={(newTab: Tab) => setActiveTab(newTab)}
                    />
                </View>
            )}
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={style.scrollContainer}
                overScrollMode="auto">
                {activeTab === 'discover' && (
                    <Flex
                        grow
                        gap="sm"
                        fullWidth
                        style={style.discoverContainer}>
                        {publicCommunities.map(c => {
                            const hasJoined = joinedCommunityIds.includes(c.id)
                            return (
                                <Flex
                                    row
                                    align="center"
                                    gap="md"
                                    key={c.id}
                                    style={style.tileContainer}>
                                    <FederationLogo federation={c} size={40} />
                                    <Flex grow gap="xs" basis={false}>
                                        <Text numberOfLines={1} medium>
                                            {c.name}
                                        </Text>
                                        <Text
                                            style={style.previewMessage}
                                            numberOfLines={2}
                                            caption
                                            medium>
                                            {c.meta.preview_message}
                                        </Text>
                                    </Flex>
                                    <Button
                                        testID={c.name
                                            .concat('JoinButton')
                                            .replaceAll(' ', '')}
                                        size="sm"
                                        disabled={hasJoined}
                                        onPress={() =>
                                            navigation.navigate(
                                                'JoinFederation',
                                                {
                                                    invite: c.meta.invite_code,
                                                },
                                            )
                                        }
                                        title={
                                            <Text
                                                small
                                                style={[
                                                    style.joinButtonText,
                                                    hasJoined && {
                                                        color: theme.colors
                                                            .night,
                                                    },
                                                ]}>
                                                {hasJoined
                                                    ? t('words.joined')
                                                    : t('words.join')}
                                            </Text>
                                        }
                                    />
                                </Flex>
                            )
                        })}
                    </Flex>
                )}

                {activeTab === 'join' && (
                    <View style={style.joinContainer}>
                        <OmniInput
                            expectedInputTypes={[]}
                            onExpectedInput={() => null}
                            onUnexpectedSuccess={() => null}
                            pasteLabel={t(
                                'feature.communities.paste-community-code',
                            )}
                        />
                    </View>
                )}

                {activeTab === 'create' && (
                    <View style={style.createContainer}>
                        <View style={style.contentWrapper}>
                            <View style={style.imageWrapper}>
                                <Image
                                    source={Images.CommunityCreate}
                                    style={style.fullWidthImage}
                                    resizeMode="contain"
                                />
                            </View>
                            <InfoEntryList
                                items={createInfoItems}
                                theme={theme}
                            />
                        </View>
                    </View>
                )}
            </ScrollView>

            <View style={style.footerContainer}>
                {activeTab === 'create' && (
                    <Button
                        fullWidth
                        title={t('phrases.create-my-community')}
                        onPress={() =>
                            navigation.navigate('FediModBrowser', {
                                url:
                                    isNightly() || isDev()
                                        ? COMMUNITY_TOOL_URL_STAGING
                                        : COMMUNITY_TOOL_URL_PROD,
                            })
                        }
                    />
                )}
            </View>
        </SafeAreaContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        scrollContainer: {
            alignItems: 'center',
            gap: 32,
            flexGrow: 1,
            padding: theme.spacing.lg,
        },
        titleContainer: {
            marginBottom: 10,
            paddingLeft: 10,
            paddingRight: 10,
        },
        title: {
            textAlign: 'center',
        },
        discoverContainer: {
            alignContent: 'flex-start',
        },
        tileContainer: {
            backgroundColor: theme.colors.offWhite,
            padding: theme.spacing.md,
            borderRadius: 16,
        },
        previewMessage: {
            color: theme.colors.primaryLight,
        },
        joinButtonText: {
            color: theme.colors.secondary,
            paddingHorizontal: theme.spacing.xs,
        },
        joinContainer: {
            top: -2,
            flex: 1,
            width: '100%',
            alignContent: 'flex-start',
        },
        switcherContainer: {
            marginHorizontal: 10,
            paddingLeft: 10,
            paddingRight: 10,
        },
        createContainer: {
            top: -2,
            flex: 1,
            width: '100%',
            alignContent: 'flex-start',
        },
        contentWrapper: {
            width: '100%',
            gap: 16,
            paddingTop: 12,
            paddingBottom: 12,
            paddingLeft: 16,
            paddingRight: 16,
        },
        titleLeft: {
            marginBottom: 16,
            fontWeight: '600',
            fontSize: 20,
            textAlign: 'left',
        },
        footerContainer: {
            width: '100%',
            padding: theme.spacing.lg,
            paddingTop: 2,
            alignItems: 'center',
        },
        imageWrapper: {
            width: '100%',
        },
        fullWidthImage: {
            width: '100%',
            height: undefined,
            aspectRatio: 931 / 816,
            borderRadius: 12,
            marginBottom: 0,
        },
    })

export default PublicCommunities
