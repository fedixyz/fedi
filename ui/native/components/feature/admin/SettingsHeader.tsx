import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet } from 'react-native'

import { selectAuthenticatedMember } from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import { NavigationHook } from '../../../types/navigation'
import Header from '../../ui/Header'
import SvgImage from '../../ui/SvgImage'
import SelectedFederationHeader from '../federations/SelectedFederationHeader'

const SettingsHeader: React.FC = () => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()
    const hasChatMember = useAppSelector(s => !!selectAuthenticatedMember(s))

    return (
        <>
            <SelectedFederationHeader />
            <Header
                inline
                backButton
                containerStyle={styles(theme).container}
                headerCenter={
                    <Text bold numberOfLines={1} adjustsFontSizeToFit>
                        {t('words.settings')}
                    </Text>
                }
                centerContainerStyle={{ flex: 2 }}
                headerRight={
                    hasChatMember && (
                        <Pressable
                            onPress={() => navigation.navigate('MemberQrCode')}
                            hitSlop={5}>
                            <SvgImage name="Qr" color={theme.colors.primary} />
                        </Pressable>
                    )
                }
                rightContainerStyle={styles(theme).rightContainer}
            />
        </>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            paddingTop: theme.spacing.md,
            paddingBottom: theme.spacing.lg,
        },
        rightContainer: {
            flex: 1,
            flexDirection: 'row',
            justifyContent: 'flex-end',
            paddingVertical: theme.spacing.sm,
        },
    })

export default SettingsHeader
