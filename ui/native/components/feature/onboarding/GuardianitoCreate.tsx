import { useNavigation } from '@react-navigation/native'
import { Button, Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'

import { useGuardianito } from '@fedi/common/hooks/federation'

import { resetToChatsScreen } from '../../../state/navigation'
import type { NavigationHook } from '../../../types/navigation'
import { WalletServiceFooter } from '../../ui/WalletServiceFooter'
import { GuardianitoIntro } from './GuardianitoIntro'

/**
 * The Create tab as it behaves without the wallet service flag: the shared
 * intro, and a CTA that hands the user to the Guardianito bot chat.
 *
 * Delete this along with the flag once the wallet service flow is the only
 * create path.
 */
export const GuardianitoCreate: React.FC = () => {
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()

    const {
        myGuardianitoBot,
        beginBotCreation,
        isLoading: isLoadingGuardianitoBot,
        showGoToChatButton,
    } = useGuardianito(t)

    const handleGoToChat = () => {
        navigation.dispatch(resetToChatsScreen())
    }

    const handleContinue = async () => {
        // we need to call this before navigating in case the existing bot has been deleted
        // and a new one needs to be created. if one exists and is active this should be fast
        const bot = await beginBotCreation()
        if (bot) {
            navigation.navigate('ChatRoomConversation', {
                roomId: bot.bot_room_id,
            })
        }
    }

    return (
        <>
            <GuardianitoIntro />
            {/* pinned below the scroll area, as the design's `.cta-bar` is */}
            <WalletServiceFooter>
                {myGuardianitoBot?.bot_room_id ? (
                    <Button
                        fullWidth
                        loading={isLoadingGuardianitoBot}
                        title={t('words.continue')}
                        onPress={handleContinue}
                    />
                ) : showGoToChatButton ? (
                    <Button
                        fullWidth
                        title={t('phrases.go-to-chat')}
                        onPress={handleGoToChat}
                    />
                ) : isLoadingGuardianitoBot ? (
                    <Button fullWidth disabled>
                        <Text caption medium style={{ marginRight: 8 }}>
                            {`${t('phrases.please-wait')}...`}
                        </Text>
                        <ActivityIndicator />
                    </Button>
                ) : (
                    <Button
                        fullWidth
                        title={t('feature.onboarding.create-button-label')}
                        onPress={beginBotCreation}
                    />
                )}
            </WalletServiceFooter>
        </>
    )
}
