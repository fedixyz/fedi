import { useNavigation } from '@react-navigation/native'
import { Text } from '@rneui/themed'
import { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'

import CustomOverlay from '../../ui/CustomOverlay'

export default function ExitFedimodOverlay({
    open,
    onOpenChange,
}: {
    open: boolean
    onOpenChange: Dispatch<SetStateAction<boolean>>
}) {
    const { t } = useTranslation()

    const navigation = useNavigation()

    return (
        <CustomOverlay
            show={open}
            contents={{
                body: (
                    <Text>{t('feature.fedimods.leave-page-confirmation')}</Text>
                ),
                buttons: [
                    {
                        text: t('words.leave'),
                        onPress: () => navigation.goBack(),
                    },
                    {
                        primary: true,
                        text: t('words.stay'),
                        onPress: () => onOpenChange(false),
                    },
                ],
            }}
        />
    )
}
