import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet } from 'react-native'

import { selectCurrency } from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import { NavigationHook } from '../../../types/navigation'
import Header from '../../ui/Header'
import SvgImage from '../../ui/SvgImage'
import BetaBanner from './BetaBanner'

const StabilityHomeHeader: React.FC = () => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()
    const selectedCurrency = useAppSelector(selectCurrency)

    const style = styles(theme)

    return (
        <>
            <Header
                backButton
                headerCenter={
                    <Text bold>{`${selectedCurrency} ${t(
                        'words.balance',
                    )}`}</Text>
                }
                headerRight={
                    <Pressable
                        onPress={() => navigation.navigate('StabilityHistory')}
                        hitSlop={5}
                        style={style.iconContainer}>
                        <SvgImage name="List" />
                    </Pressable>
                }
                rightContainerStyle={style.rightContainer}
            />
            <BetaBanner />
        </>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            paddingBottom: theme.spacing.lg,
        },
        iconContainer: {
            flexDirection: 'row',
            alignItems: 'flex-end',
        },
        rightContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
        },
    })

export default StabilityHomeHeader
