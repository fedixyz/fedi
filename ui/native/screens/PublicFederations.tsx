import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, View } from 'react-native'

import { useLatestPublicFederations } from '@fedi/common/hooks/federation'
import {
    selectIsWalletServiceCreationEnabled,
    selectFederationIds,
    selectWalletServiceFlowStatus,
} from '@fedi/common/redux'

import { FederationLogo } from '../components/feature/federations/FederationLogo'
import { OmniInput } from '../components/feature/omni/OmniInput'
import { GuardianitoCreate } from '../components/feature/onboarding/GuardianitoCreate'
import { WalletServiceEntry } from '../components/feature/walletservice/WalletServiceEntry'
import { Row, Column } from '../components/ui/Flex'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import { Switcher } from '../components/ui/Switcher'
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
    // `unknown` is the pre-status window, so it must read as "not formed"
    // rather than flipping the tab label once the first status lands
    const hasWalletService =
        useAppSelector(selectWalletServiceFlowStatus) === 'formed'
    const joinedFederationIds = useAppSelector(selectFederationIds)
    const publicFederations = useAppSelector(
        s => s.federation.publicFederations,
    )
    const isWalletServiceCreationEnabled = useAppSelector(
        selectIsWalletServiceCreationEnabled,
    )

    const style = styles(theme)

    type Tab = 'discover' | 'join' | 'create'

    const [activeTab, setActiveTab] = useState<Tab>('discover')

    const switcherOptions: Array<{
        label: string
        value: Tab
        title: string
        subText: string
    }> = [
        {
            label: t('words.discover'),
            value: 'discover',
            title: t('feature.onboarding.title'),
            subText: t('feature.onboarding.description'),
        },
        {
            label: t('words.join'),
            value: 'join',
            title: t('feature.onboarding.title-join'),
            subText: t('feature.onboarding.description-join'),
        },
        {
            // one Wallet Service per user, so once one is formed this tab
            // manages the existing service instead of offering a second
            label: hasWalletService ? t('words.manage') : t('words.create'),
            value: 'create',
            title: t('feature.onboarding.title-create'),
            subText: t('feature.onboarding.description-create'),
        },
    ]

    const selectedOption =
        switcherOptions.find(opt => opt.value === activeTab) ??
        switcherOptions[0]

    return (
        <SafeAreaContainer edges="none" style={style.screen}>
            {/* HEADER */}
            <Column
                align="center"
                gap="sm"
                fullWidth
                style={style.titleContainer}>
                <Text medium style={style.title}>
                    {selectedOption.title}
                </Text>
                <Text
                    small
                    center
                    color={theme.colors.darkGrey}
                    style={style.subtitle}>
                    {selectedOption.subText}
                </Text>
            </Column>

            <View style={style.switcherContainer}>
                <Switcher<Tab>
                    options={switcherOptions}
                    selected={activeTab}
                    onChange={(newTab: Tab) => setActiveTab(newTab)}
                />
            </View>

            {/* the create tab owns its own scroll area and pinned action, so it
                replaces the shared one rather than nesting inside it */}
            {activeTab === 'create' ? (
                isWalletServiceCreationEnabled ? (
                    <WalletServiceEntry />
                ) : (
                    <GuardianitoCreate />
                )
            ) : (
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
                            {publicFederations.map(f => {
                                const hasJoined = joinedFederationIds.includes(
                                    f.id,
                                )
                                return (
                                    <Row
                                        align="center"
                                        gap="md"
                                        key={f.id}
                                        style={style.tileContainer}>
                                        <FederationLogo
                                            federation={f}
                                            size={40}
                                        />
                                        <Column grow gap="xs" basis={false}>
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
                                        </Column>
                                        <Button
                                            testID={f.name
                                                .concat('JoinButton')
                                                .replaceAll(' ', '')}
                                            size="sm"
                                            disabled={hasJoined}
                                            onPress={() =>
                                                navigation.navigate(
                                                    'JoinFederation',
                                                    {
                                                        invite: f.meta
                                                            .invite_code,
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
                                    </Row>
                                )
                            })}
                        </Column>
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
                </ScrollView>
            )}
        </SafeAreaContainer>
    )
}

/** `.scroll` in the design pads the page by 20 on each side. */
const SCREEN_PADDING = 20

const styles = (theme: Theme) =>
    StyleSheet.create({
        discoverContainer: {
            alignContent: 'flex-start',
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
        previewMessage: {
            color: theme.colors.primaryLight,
        },
        // `WalletServiceFooter` owns the home indicator inset, so the container
        // must not contribute one as well
        screen: {
            paddingBottom: 0,
        },
        scrollContainer: {
            alignItems: 'center',
            flexGrow: 1,
            paddingBottom: 16,
            paddingHorizontal: SCREEN_PADDING,
            paddingTop: 2,
        },
        subtitle: {
            lineHeight: 16,
            maxWidth: 300,
        },
        switcherContainer: {
            marginBottom: 8,
            paddingHorizontal: SCREEN_PADDING,
        },
        tileContainer: {
            backgroundColor: theme.colors.offWhite,
            padding: theme.spacing.md,
            borderRadius: 16,
        },
        title: {
            fontSize: 20,
            lineHeight: 28,
            textAlign: 'center',
        },
        titleContainer: {
            marginBottom: 8,
            marginTop: 4,
            // the design insets the title a further 6 inside the page padding
            paddingHorizontal: SCREEN_PADDING + 6,
        },
    })

export default PublicFederations
