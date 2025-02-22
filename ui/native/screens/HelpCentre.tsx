import { Theme, useTheme } from '@rneui/themed'
import { StyleSheet, View } from 'react-native'

import SupportChat from '../components/feature/support/SupportChat'

const HelpCentre: React.FC = () => {
    const { theme } = useTheme()
    const style = styles(theme)
    return (
        <View style={style.container}>
            <SupportChat />
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: theme.colors.white,
            justifyContent: 'flex-start',
        },
    })

export default HelpCentre
