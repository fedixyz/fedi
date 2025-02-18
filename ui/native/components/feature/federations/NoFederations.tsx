import { useNavigation } from '@react-navigation/native'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Image, ScrollView, StyleSheet, View } from 'react-native'

import { useLatestPublicFederations } from '@fedi/common/hooks/federation'
import { Images } from '@fedi/native/assets/images'

import SvgImage from '../../ui/SvgImage'
import { FederationLogo } from './FederationLogo'

const AWESOME_FEDIMINT_LINK = 'https://github.com/fedimint/awesome-fedimint'

const NoFederations: React.FC = () => {
    const { t } = useTranslation()
    const navigation = useNavigation()
    const { theme } = useTheme()
    const { publicFederations } = useLatestPublicFederations()

    const style = styles(theme)

    const onOpenAwesomeFedimint = () => {
        navigation.navigate('FediModBrowser', {
            url: AWESOME_FEDIMINT_LINK,
        })
    }

    return (
        <ScrollView
            contentContainerStyle={style.container}
            alwaysBounceVertical={false}>
            <Image style={style.image} source={Images.AwesomeFedimint} />
            <View style={style.titleContainer}>
                <Text h2 medium>
                    {t('feature.community.join-a-community')}
                </Text>
                <Text style={style.subtitle}>
                    {t('feature.community.join-community-guidance')}
                </Text>
            </View>
            <View style={style.contentContainer}>
                {publicFederations.map(f => {
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
                                onPress={() =>
                                    navigation.navigate('JoinFederation', {
                                        invite: f.meta.invite_code,
                                    })
                                }
                                title={
                                    <Text small style={[style.joinButtonText]}>
                                        {t('words.join')}
                                    </Text>
                                }
                            />
                        </View>
                    )
                })}
                <View style={style.buttonGroup}>
                    <Button
                        title={
                            <Text caption medium style={style.joinButtonText}>
                                {t('phrases.add-community')}
                            </Text>
                        }
                        onPress={() =>
                            navigation.navigate('JoinFederation', {
                                invite: undefined,
                            })
                        }
                    />
                    <Button
                        type="clear"
                        title={
                            <View style={style.link}>
                                <Text caption medium>
                                    {t(
                                        'feature.community.or-visit-awesome-fedimint',
                                    )}
                                </Text>
                                <SvgImage name="ExternalLink" size={20} />
                            </View>
                        }
                        onPress={() => onOpenAwesomeFedimint()}
                    />
                </View>
            </View>
        </ScrollView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flexGrow: 1,
            justifyContent: 'center',
            alignItems: 'center',
            gap: 23,
            padding: theme.spacing.lg,
        },
        titleContainer: {
            gap: 24,
            alignItems: 'center',
            textAlign: 'center',
        },
        image: {
            height: 200,
            width: 200,
        },
        title: {
            textAlign: 'center',
        },
        subtitle: {
            textAlign: 'center',
            lineHeight: 20,
            fontFamily: 'Albert Sans',
            letterSpacing: 0.16,
        },
        contentContainer: {
            width: '100%',
            gap: 24,
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
        link: {
            alignItems: 'center',
            flexDirection: 'row',
            gap: 8,
        },
        buttonGroup: {
            gap: theme.spacing.sm,
        },
    })

export default NoFederations
