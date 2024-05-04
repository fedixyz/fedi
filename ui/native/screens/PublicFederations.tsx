import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Image, ScrollView, StyleSheet, View } from 'react-native'

import { selectFederationIds } from '@fedi/common/redux'

import { Images } from '../assets/images'
import { FederationLogo } from '../components/ui/FederationLogo'
import { useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'PublicFederations'
>

const PublicFederations: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const joinedFederationIds = useAppSelector(selectFederationIds)
    const publicFederations = useAppSelector(
        s => s.federation.publicFederations,
    )

    const style = styles(theme)

    return (
        <ScrollView
            contentContainerStyle={style.container}
            overScrollMode="auto">
            <View style={style.titleContainer}>
                <Image style={style.image} source={Images.AwesomeFedimint} />
                <Text h2 medium h2Style={style.title}>
                    {t('feature.onboarding.guidance-public-federations')}
                </Text>
            </View>
            <View style={style.contentContainer}>
                {publicFederations.map(f => {
                    const hasJoined = joinedFederationIds.includes(f.id)

                    return (
                        <View key={f.id} style={style.tileContainer}>
                            <View style={{}}>
                                <FederationLogo federation={f} size={40} />
                            </View>
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
                                    navigation.navigate('JoinFederation', {
                                        invite: f.meta.invite_code,
                                    })
                                }
                                title={
                                    <Text
                                        small
                                        style={[
                                            style.joinButtonText,
                                            hasJoined
                                                ? { color: theme.colors.night }
                                                : {},
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
                <Button
                    fullWidth
                    type="clear"
                    title={
                        <Text caption medium>
                            {t('phrases.join-another-federation')}
                        </Text>
                    }
                    onPress={() =>
                        navigation.navigate('JoinFederation', {
                            invite: undefined,
                        })
                    }
                />
            </View>
        </ScrollView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            alignItems: 'center',
            gap: 32,
            padding: theme.spacing.lg,
        },
        titleContainer: {
            gap: 32,
            alignItems: 'center',
        },
        image: {
            height: 200,
            width: 200,
        },
        title: {
            textAlign: 'center',
        },
        contentContainer: {
            flex: 1,
            width: '100%',
            gap: 16,
            justifyContent: 'flex-end',
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
        previewMessage: { color: theme.colors.primaryLight },
        joinButtonText: {
            color: theme.colors.secondary,
            paddingHorizontal: theme.spacing.xs,
        },
    })

export default PublicFederations
