import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme, Image } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, ScrollView, StyleSheet, View } from 'react-native'

import { useLatestPublicFederations } from '@fedi/common/hooks/federation'
import { selectFederationIds } from '@fedi/common/redux'
import { Images } from '@fedi/native/assets/images'

import { FederationLogo } from '../components/feature/federations/FederationLogo'
import { FirstTimeCommunityEntryItem } from '../components/feature/federations/FirstTimeCommunityEntryOverlay'
import InfoEntryList from '../components/feature/home/InfoEntryList'
import { Switcher } from '../components/feature/home/Switcher'
import { OmniInput } from '../components/feature/omni/OmniInput'
import { useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'PublicFederations'
>
const PublicFederations: React.FC<Props> = ({ navigation }) => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    useLatestPublicFederations()
    const joinedFederationIds = useAppSelector(selectFederationIds)
    const publicFederations = useAppSelector(
        s => s.federation.publicFederations,
    )

    const style = styles(theme)

    type Tab = 'discover' | 'join' | 'create'

    const [activeTab, setActiveTab] = useState<Tab>('discover')

    const switcherOptions: Array<{
        label: string
        value: Tab
        subText: string
    }> = [
        {
            label: t('words.discover'),
            value: 'discover',
            subText: t('feature.onboarding.description'),
        },
        {
            label: t('words.join'),
            value: 'join',
            subText: t('feature.onboarding.description-join'),
        },
        // {
        //     label: t('words.create'),
        //     value: 'create',
        //     subText: t('feature.onboarding.description-create'),
        // },
    ]

    const selectedOption =
        switcherOptions.find(opt => opt.value === activeTab) ??
        switcherOptions[0]

    const createInfoItems: FirstTimeCommunityEntryItem[] = [
        { icon: 'SocialPeople', text: t('feature.federation.create-info-1') },
        {
            icon: 'ShieldHalfFilled',
            text: t('feature.federation.create-info-3'),
        },
        { icon: 'Wallet', text: t('feature.federation.create-info-5') },
    ]

    return (
        <View style={{ flex: 1 }}>
            {/* HEADER */}
            <View style={style.titleContainer}>
                <Text h2 medium h2Style={style.title}>
                    {t('feature.onboarding.title')}
                </Text>
                <Text
                    h4
                    medium
                    h4Style={{
                        fontSize: 14,
                        color: theme.colors.darkGrey,
                        textAlign: 'center',
                        paddingLeft: 10,
                        paddingRight: 10,
                        paddingBottom: 10,
                    }}>
                    {selectedOption.subText}
                </Text>
            </View>

            <View style={style.switcherContainer}>
                <Switcher<Tab>
                    options={switcherOptions}
                    selected={activeTab}
                    onChange={(newTab: Tab) => setActiveTab(newTab)}
                />
            </View>

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={style.scrollContainer}
                overScrollMode="auto">
                {activeTab === 'discover' && (
                    <View style={style.discoverContainer}>
                        {publicFederations.map(f => {
                            const hasJoined = joinedFederationIds.includes(f.id)
                            return (
                                <View key={f.id} style={style.tileContainer}>
                                    <FederationLogo federation={f} size={40} />
                                    <View style={style.tileTextContainer}>
                                        <Text numberOfLines={1} medium>
                                            {f.name}
                                        </Text>
                                        <Text
                                            style={style.previewMessage}
                                            numberOfLines={2}
                                            caption
                                            medium>
                                            {f.meta.preview_message}
                                        </Text>
                                    </View>
                                    <Button
                                        size="sm"
                                        disabled={hasJoined}
                                        onPress={() =>
                                            navigation.navigate(
                                                'JoinFederation',
                                                {
                                                    invite: f.meta.invite_code,
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
                                </View>
                            )
                        })}
                    </View>
                )}

                {activeTab === 'join' && (
                    <View style={style.joinContainer}>
                        <OmniInput
                            expectedInputTypes={[]}
                            onExpectedInput={() => null}
                            onUnexpectedSuccess={() => null}
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
                                    resizeMode="cover"
                                />
                            </View>
                            <InfoEntryList
                                items={createInfoItems}
                                theme={theme}
                            />
                        </View>
                        <View style={style.buttonsContainer}>
                            <Button
                                fullWidth
                                title={'Create My Community'}
                                onPress={() =>
                                    Linking.openURL(
                                        'https://support.fedi.xyz/hc/en-us/sections/18214787528082-Federation-Setup',
                                    )
                                }
                            />
                        </View>
                    </View>
                )}
            </ScrollView>

            <View style={style.footerContainer}>
                <Button
                    fullWidth
                    type="clear"
                    title={
                        <Text caption medium>
                            {t('phrases.maybe-later')}
                        </Text>
                    }
                    onPress={() => navigation.navigate('TabsNavigator')}
                />
            </View>
        </View>
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
            width: '100%',
            alignItems: 'center',
            justifyContent: 'space-evenly',
            gap: theme.spacing.sm,
            marginBottom: 10,
            paddingLeft: 10,
            paddingRight: 10,
        },
        buttonsContainer: {
            width: '100%',
            flexDirection: 'column',
            marginBottom: theme.spacing.sm,
            marginTop: theme.spacing.lg,
        },
        title: {
            textAlign: 'center',
        },
        discoverContainer: {
            flex: 1,
            width: '100%',
            gap: 8,
            alignContent: 'flex-start',
        },
        tileContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: theme.colors.offWhite,
            padding: theme.spacing.md,
            borderRadius: 16,
            gap: 12,
        },
        tileTextContainer: {
            flex: 1,
            flexDirection: 'column',
            gap: theme.spacing.xs,
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

export default PublicFederations
