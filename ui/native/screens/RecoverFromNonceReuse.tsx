import { useNavigation } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text } from '@rneui/themed'
import { useTranslation } from 'react-i18next'

import { Column } from '../components/ui/Flex'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import SvgImage from '../components/ui/SvgImage'
import { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'RecoverFromNonceReuse'
>

const RecoverFromNonceReuse: React.FC<Props> = () => {
    const { t } = useTranslation()
    const navigation = useNavigation()

    return (
        <SafeAreaContainer edges="notop">
            <Column grow center gap="md">
                <SvgImage name="ContinueRecovery" size={64} />
                <Text h2>{t('feature.recovery.continue-recovery')}</Text>
                <Text>
                    {t('feature.recovery.continue-recovery-description')}
                </Text>
            </Column>
            <Button
                onPress={() =>
                    navigation.navigate('TabsNavigator', {
                        initialRouteName: 'Federations',
                    })
                }>
                {t('words.okay')}
            </Button>
        </SafeAreaContainer>
    )
}

export default RecoverFromNonceReuse
