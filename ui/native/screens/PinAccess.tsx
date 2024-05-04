import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Switch, Text, Theme, useTheme } from '@rneui/themed'
import { ResourceKey } from 'i18next'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'

import {
    ProtectedFeatures,
    selectProtectedFeatures,
    setFeatureUnlocked,
    setProtectedFeature,
} from '@fedi/common/redux'

import SvgImage from '../components/ui/SvgImage'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'PinAccess'>

const protectedFeatureToi18nKey: Record<keyof ProtectedFeatures, ResourceKey> =
    {
        app: 'feature.pin.unlocking-fedi-app',
        changePin: 'feature.pin.change-pin',
    } as const

const PinAccess: React.FC<Props> = ({ navigation }) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const protectedFeatures = useAppSelector(selectProtectedFeatures)
    const dispatch = useAppDispatch()

    const style = styles(theme)

    return (
        <ScrollView contentContainerStyle={style.container}>
            {Object.entries(protectedFeatures)
                // The user is always required to enter their current PIN before changing it
                .filter(([key]) => key !== 'changePin')
                .map(([key, value]) => (
                    <View style={style.item} key={key}>
                        <Text>
                            {t(
                                protectedFeatureToi18nKey[
                                    key as keyof ProtectedFeatures
                                ],
                            )}
                        </Text>
                        <Switch
                            value={value}
                            onChange={() => {
                                dispatch(
                                    setProtectedFeature({
                                        key: key as keyof ProtectedFeatures,
                                        enabled: !value,
                                    }),
                                )
                                dispatch(
                                    setFeatureUnlocked({
                                        key: key as keyof ProtectedFeatures,
                                        unlocked: true,
                                    }),
                                )
                            }}
                        />
                    </View>
                ))}
            <Pressable
                style={style.item}
                onPress={() => {
                    navigation.navigate('SetPin')
                }}>
                <Text>{t('feature.pin.change-pin')}</Text>
                <SvgImage name="ChevronRight" color={theme.colors.darkGrey} />
            </Pressable>
        </ScrollView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            justifyContent: 'flex-start',
            padding: theme.spacing.xl,
            flexDirection: 'column',
            gap: 24,
        },
        item: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
        },
    })

export default PinAccess
