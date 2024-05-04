import { Theme, useTheme } from '@rneui/themed'
import { StyleSheet, View } from 'react-native'

import { useShouldShowStabilityPool } from '@fedi/common/hooks/federation'

import StabilityWallet from '../stabilitypool/StabilityWallet'
import BitcoinWallet from '../wallet/BitcoinWallet'

type Props = {
    offline: boolean
}
const HomeWallets = ({ offline }: Props) => {
    const { theme } = useTheme()
    const style = styles(theme)
    const showStabilityWallet = useShouldShowStabilityPool()
    return (
        <View style={style.balances}>
            <BitcoinWallet offline={offline} />
            {showStabilityWallet && <StabilityWallet />}
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        balances: {
            gap: theme.spacing.lg,
        },
    })

export default HomeWallets
