import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import capitalize from 'lodash/capitalize'
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
    const network = activeFederation.network

    return (
        <Pressable
            style={style.container}
            onPress={() => navigation.navigate('Transactions')}>
            <View style={style.titleContainer}>
                <SvgImage
                    name="BitcoinCircle"
                    size={SvgImageSize.md}
                    color={theme.colors.white}
                />
                <View>
                    <View style={style.row}>
                        <Text bold style={style.title}>
                            {t('words.bitcoin')}
                        </Text>
                    </View>
                    {network && network !== 'bitcoin' && (
                        <Text small medium style={style.title}>
                            {capitalize(network)}
                        </Text>
                    )}
                </View>
            </View>
            <Balance />
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
        title: {
            color: theme.colors.secondary,
        },
        titleContainer: {
            textAlign: 'left',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: theme.spacing.sm,
        },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
        },
    })

export default WalletHeader
