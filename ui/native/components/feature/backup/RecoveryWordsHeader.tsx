import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable } from 'react-native'

import { reset } from '../../../state/navigation'
import { RootStackParamList } from '../../../types/navigation'
import Header from '../../ui/Header'

type RecoveryWordsRouteProp = RouteProp<RootStackParamList, 'RecoveryWords'>

const RecoveryWordsHeader: React.FC = () => {
    const { t } = useTranslation()
    const navigation = useNavigation()
    const route = useRoute<RecoveryWordsRouteProp>()
    const { isFromJoin } = route.params || {}

    // Only show skip if coming from the join screen
    // Only show back button if coming from the settings screen
    return (
        <Header
            backButton={!isFromJoin}
            headerCenter={
                <Text bold numberOfLines={1} adjustsFontSizeToFit>
                    {t('feature.backup.personal-backup')}
                </Text>
            }
            headerRight={
                isFromJoin ? (
                    <Pressable
                        onPress={() =>
                            navigation.dispatch(reset('TabsNavigator'))
                        }>
                        <Text>{t('words.skip')}</Text>
                    </Pressable>
                ) : undefined
            }
        />
    )
}

export default RecoveryWordsHeader
