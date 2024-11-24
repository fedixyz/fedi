import { useNavigation } from '@react-navigation/native'
import { Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Pressable } from 'react-native'

import { fedimint } from '../../../bridge'
import { NavigationHook } from '../../../types/navigation'
import Header from '../../ui/Header'
import SvgImage from '../../ui/SvgImage'

type SocialRecoveryHeaderProps = {
    backButton?: boolean
    closeButton?: boolean
    cancelButton?: boolean
}

const SocialRecoveryHeader: React.FC<SocialRecoveryHeaderProps> = ({
    backButton = false,
    closeButton = false,
    cancelButton = false,
}: SocialRecoveryHeaderProps) => {
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()

    async function handleCancelSocialRecovery() {
        navigation.reset({
            index: 0,
            routes: [{ name: 'Splash' }],
        })
        await fedimint.cancelSocialRecovery()
    }

    function onCloseButton() {
        Alert.alert(
            t('feature.recovery.cancel-social-recovery'),
            t('feature.recovery.cancel-social-recovery-detail'),
            [
                {
                    text: t('words.no'),
                },
                {
                    text: t('words.yes'),
                    onPress: handleCancelSocialRecovery,
                },
            ],
        )
    }

    return (
        <Header
            backButton={backButton}
            headerCenter={
                <Text bold numberOfLines={1} adjustsFontSizeToFit>
                    {t('feature.recovery.social-recovery')}
                </Text>
            }
            closeButton={closeButton}
            headerRight={
                cancelButton ? (
                    <>
                        <Pressable onPress={onCloseButton}>
                            <SvgImage name="Close" />
                        </Pressable>
                    </>
                ) : undefined
            }
        />
    )
}

export default SocialRecoveryHeader
