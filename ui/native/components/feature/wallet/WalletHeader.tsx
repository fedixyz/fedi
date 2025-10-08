import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet } from 'react-native'

import { LoadedFederation } from '@fedi/common/types'

import { NavigationHook } from '../../../types/navigation'
import Flex from '../../ui/Flex'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'
import Balance from './Balance'

type Props = {
    federation: LoadedFederation
}

const WalletHeader: React.FC<Props> = ({ federation }) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()

    const style = styles(theme)

    if (!federation) return null

    return (
        <Pressable
            style={style.container}
            onPress={() =>
                navigation.navigate('Transactions', {
                    federationId: federation.id,
                })
            }>
            <Flex row align="center" gap="sm">
                <SvgImage
                    name="BitcoinCircle"
                    size={SvgImageSize.sm}
                    color={theme.colors.orange}
                />
                <Text medium style={style.title}>
                    {t('words.bitcoin')}
                </Text>
            </Flex>
            <Balance federationId={federation.id} />
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
        title: {
            color: theme.colors.primary,
        },
    })

export default WalletHeader
