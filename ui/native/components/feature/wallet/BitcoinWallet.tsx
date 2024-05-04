import type { Theme } from '@rneui/themed'
import { useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet } from 'react-native'
import { LinearGradientProps } from 'react-native-linear-gradient'

import {
    selectActiveFederation,
    selectActiveFederationHasWallet,
} from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import { BubbleCard } from '../../ui/BubbleView'
import WalletButtons from './WalletButtons'
import WalletHeader from './WalletHeader'

type Props = {
    offline: boolean
}

const BitcoinWallet: React.FC<Props> = ({ offline }: Props) => {
    const { theme } = useTheme()
    const activeFederation = useAppSelector(selectActiveFederation)
    const hasWallet = useAppSelector(selectActiveFederationHasWallet)

    const style = styles(theme)

    if (!activeFederation || !hasWallet) return null
    const gradientProps: LinearGradientProps = {
        colors: ['rgba(255, 255, 255, 0.2)', 'rgba(255, 255, 255, 0.0)'],
        start: { x: 0, y: 0 },
        end: { x: 0, y: 1 },
    }

    return (
        <BubbleCard
            linearGradientProps={gradientProps}
            containerStyle={style.card}>
            <WalletHeader />
            <WalletButtons offline={offline} />
        </BubbleCard>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        card: { backgroundColor: theme.colors.orange },
    })

export default BitcoinWallet
