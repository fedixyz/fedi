import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { selectActiveFederation } from '@fedi/common/redux/federation'

import { useAppSelector } from '../../../state/hooks'
import { NavigationHook } from '../../../types/navigation'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'
import Balance from './Balance'

const WalletHeader: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()
    const activeFederation = useAppSelector(selectActiveFederation)

    const style = styles(theme)

    if (!activeFederation) return null

    return (
        <Pressable
            style={style.container}
            onPress={() => navigation.navigate('Transactions')}>
            <View style={style.leftGroup}>
                <SvgImage
                    name="BitcoinCircle"
                    size={SvgImageSize.md}
                    color={theme.colors.white}
                />
                <Text bold style={style.title}>
                    {t('words.bitcoin')}
                </Text>
                <SvgImage
                    name="ChevronRightSmall"
                    color={theme.colors.secondary}
                    containerStyle={{ top: 1 }}
                    dimensions={{ width: 6, height: 12 }}
                />
            </View>
            <Balance />
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
        /** Row holding icon, title, and chevron ‑ all centered vertically */
        leftGroup: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
        },
        title: {
            color: theme.colors.secondary,
        },
    })

export default WalletHeader
