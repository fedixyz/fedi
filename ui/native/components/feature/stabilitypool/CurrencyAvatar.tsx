import { useTheme, Theme, Avatar } from '@rneui/themed'
import React from 'react'
import { StyleSheet } from 'react-native'

import { selectCurrency } from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'

interface Props {
    size?: number
}

export const CurrencyAvatar: React.FC<Props> = ({ size }) => {
    const { theme } = useTheme()
    const currency = useAppSelector(selectCurrency)

    const style = styles(theme)

    return (
        <Avatar
            size={size || theme.sizes.md}
            title={currency}
            titleStyle={style.currencyAvatarTitle}
            containerStyle={style.currencyAvatar}
            rounded
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        currencyAvatar: {
            backgroundColor: theme.colors.green,
        },
        currencyAvatarTitle: {
            ...theme.styles.avatarText,
        },
    })
