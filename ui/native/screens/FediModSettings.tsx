import { useNavigation } from '@react-navigation/native'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, StyleSheet, View, Image } from 'react-native'
import { EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context'

import {
    removeCustomFediMod,
    selectActiveFederation,
    selectFederationCustomFediMods,
} from '@fedi/common/redux'

import { FediModImages } from '../assets/images'
import SvgImage from '../components/ui/SvgImage'
import { useAppDispatch, useAppSelector } from '../state/hooks'

const FediModSettings: React.FC = () => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const insets = useSafeAreaInsets()
    const navigation = useNavigation()
    const customFediMods = useAppSelector(selectFederationCustomFediMods)
    const activeFederation = useAppSelector(selectActiveFederation)
    const reduxDispatch = useAppDispatch()

    const style = styles(theme, insets)

    const removeFediMod = (fediModId: string) => {
        if (!activeFederation) return
        reduxDispatch(
            removeCustomFediMod({
                federationId: activeFederation.id,
                fediModId,
            }),
        )
    }

    return (
        <View style={style.container}>
            <ScrollView
                style={style.scrollContainer}
                contentContainerStyle={style.contentContainer}
                overScrollMode="auto">
                {customFediMods.length > 0 ? (
                    <>
                        <Text style={style.label}>
                            {t('feature.fedimods.your-mods')}
                        </Text>
                        <View style={style.fediModsContainer}>
                            {customFediMods.map(fediMod => (
                                <View key={fediMod.id} style={style.fediMod}>
                                    <Image
                                        style={style.iconImage}
                                        source={
                                            fediMod.imageUrl
                                                ? {
                                                      uri: fediMod.imageUrl,
                                                  }
                                                : FediModImages.default
                                        }
                                        resizeMode="contain"
                                    />

                                    <View style={style.fediModText}>
                                        <Text>{fediMod.title}</Text>
                                        <Text small>{fediMod.url}</Text>
                                    </View>
                                    <Pressable
                                        onPress={() =>
                                            removeFediMod(fediMod.id)
                                        }>
                                        <SvgImage name="Close" size={24} />
                                    </Pressable>
                                </View>
                            ))}
                        </View>
                    </>
                ) : (
                    <View style={style.empty}>
                        <Pressable
                            onPress={() => navigation.navigate('AddFediMod')}>
                            <SvgImage name="NewModIcon" size={48} />
                        </Pressable>
                        <Text>{t('feature.fedimods.add-mods-homescreen')}</Text>
                    </View>
                )}
            </ScrollView>
            <Button onPress={() => navigation.navigate('AddFediMod')}>
                {t('feature.fedimods.add-a-mod')}
            </Button>
        </View>
    )
}

const styles = (theme: Theme, insets: EdgeInsets) =>
    StyleSheet.create({
        scrollContainer: {
            flex: 1,
        },
        contentContainer: {
            flexGrow: 1,
            gap: theme.spacing.lg,
        },
        container: {
            flex: 1,
            flexDirection: 'column',
            gap: theme.spacing.md,
            paddingTop: theme.spacing.lg,
            paddingLeft: insets.left + theme.spacing.lg,
            paddingRight: insets.right + theme.spacing.lg,
            paddingBottom: Math.max(insets.bottom, theme.spacing.lg),
        },
        empty: {
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: theme.spacing.md,
            alignItems: 'center',
            justifyContent: 'center',
        },
        fediModsContainer: {
            gap: theme.spacing.lg,
        },
        fediMod: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.md,
            justifyContent: 'space-between',
        },
        fediModText: {
            flex: 1,
        },
        iconImage: {
            width: 32,
            height: 32,
            overflow: 'hidden',
            borderRadius: 8,
        },
        label: {
            color: theme.colors.darkGrey,
        },
    })

export default FediModSettings
