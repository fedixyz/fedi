import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { RootStackParamList } from '../../../types/navigation'
import Header from '../../ui/Header'
import { PressableIcon } from '../../ui/PressableIcon'

type AddFediModRouteProp = RouteProp<RootStackParamList, 'AddFediMod'>

const AddFediModHeader: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const navigation = useNavigation()
    const style = styles(theme)

    const route = useRoute<AddFediModRouteProp>()
    const { inputMethod } = route.params

    const buttonSvgName = inputMethod === 'enter' ? 'Scan' : 'Globe'

    const toggleInputMethod = () => {
        const otherInputMethod = inputMethod === 'enter' ? 'scan' : 'enter'
        navigation.navigate('AddFediMod', {
            inputMethod: otherInputMethod,
        })
    }

    return (
        <Header
            backButton
            headerCenter={<Text>{t('feature.fedimods.add-a-mini-app')}</Text>}
            headerRight={
                <PressableIcon
                    containerStyle={style.headerIcon}
                    onPress={toggleInputMethod}
                    hitSlop={5}
                    svgName={buttonSvgName}
                    svgProps={{ size: 23 }}
                />
            }
        />
    )
}
const styles = (theme: Theme) =>
    StyleSheet.create({
        headerIcon: {
            alignItems: 'center',
            display: 'flex',
            height: theme.sizes.md,
            justifyContent: 'center',
            width: theme.sizes.md,
        },
    })

export default AddFediModHeader
