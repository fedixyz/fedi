import { useNavigation } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme, Image } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, View } from 'react-native'

import { COMMUNITY_TOOL_URL } from '@fedi/common/constants/fedimods'
import { useLatestPublicCommunities } from '@fedi/common/hooks/federation'
import { openMiniAppSession, selectCommunityIds } from '@fedi/common/redux'
import { Images } from '@fedi/native/assets/images'

import { FederationLogo } from '../components/feature/federations/FederationLogo'
import InfoEntryList from '../components/feature/home/InfoEntryList'
import { Switcher } from '../components/feature/home/Switcher'
import { OmniInput } from '../components/feature/omni/OmniInput'
import { FirstTimeOverlayItem } from '../components/feature/onboarding/FirstTimeOverlay'
import { Column, Row } from '../components/ui/Flex'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { PublicCommunity } from '../types'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'PublicCommunities'
>
type Tab = 'discover' | 'join' | 'create'

const PublicCommunities: React.FC<Props> = ({ navigation }) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const dispatch = useAppDispatch()

    const { isFetchingPublicCommunities } = useLatestPublicCommunities()
    const publicCommunities = useAppSelector(
        s => s.federation.publicCommunities,
    )

    const style = styles(theme)

    const [activeTab, setActiveTab] = useState<Tab>('join')

    const switcherOptions: Array<{
        label: string
        value: Tab
        subText: string
    }> = [
        {
            label: t('words.join'),
            value: 'join',
            subText: t('feature.communities.guidance-join'),
        },
        {
            label: t('words.create'),
            value: 'create',
            subText: t('feature.onboarding.description-create-community'),
        },
    ]

    if (publicCommunities.length > 0 && !isFetchingPublicCommunities) {
        switcherOptions.push({
            label: t('words.discover'),
            value: 'discover',
            subText: t('feature.communities.guidance-discover'),
        })
    }

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
            <Column
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
            </Column>

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
                    <Column
                        grow
                        gap="sm"
                        fullWidth
                        style={style.discoverContainer}>
                        {publicCommunities.map(c => (
                            <PublicCommunityItem key={c.id} community={c} />
                        ))}
                    </Column>
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
                        onPress={() => {
                            dispatch(
                                openMiniAppSession({
                                    miniAppId: COMMUNITY_TOOL_URL,
                                    url: COMMUNITY_TOOL_URL,
                                }),
                            )
                            navigation.navigate('FediModBrowser')
                        }}
                    />
                )}
            </View>
        </SafeAreaContainer>
    )
}

function PublicCommunityItem({ community }: { community: PublicCommunity }) {
    const joinedCommunityIds = useAppSelector(selectCommunityIds)
    const navigation = useNavigation()

    const { theme } = useTheme()
    const { t } = useTranslation()

    const style = styles(theme)
    const hasJoined = joinedCommunityIds.includes(community.id)

    return (
        <Row align="center" gap="md" style={style.tileContainer}>
            <FederationLogo federation={community} size={40} />
            <Column grow gap="xs" basis={false}>
                <Text numberOfLines={1} medium>
                    {community.name}
                </Text>
                <Text
                    style={style.previewMessage}
                    numberOfLines={2}
                    caption
                    medium>
                    {community.meta.preview_message}
                </Text>
            </Column>
            <Button
                testID={community.name.concat('JoinButton').replaceAll(' ', '')}
                size="sm"
                disabled={hasJoined}
                onPress={() =>
                    navigation.navigate('JoinFederation', {
                        invite: community.meta.invite_code,
                    })
                }
                title={
                    <Text
                        small
                        style={[
                            style.joinButtonText,
                            hasJoined && {
                                color: theme.colors.night,
                            },
                        ]}>
                        {hasJoined ? t('words.joined') : t('words.join')}
                    </Text>
                }
            />
        </Row>
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
