import { useNavigation } from '@react-navigation/native'
import { useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable } from 'react-native'

import { selectIsActiveFederationRecovering } from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import { NavigationHook } from '../../../types/navigation'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'
import { RecoveryInProgressOverlay } from '../recovery/RecoveryInProgressOverlay'

type ChatWalletButtonProps = {
    recipientId: string
}

const ChatWalletButton: React.FC<ChatWalletButtonProps> = ({
    recipientId,
}: ChatWalletButtonProps) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()
    const [showOverlay, setShowOverlay] = useState(false)
    const recoveryInProgress = useAppSelector(
        selectIsActiveFederationRecovering,
    )

    return (
        <>
            <Pressable
                onPress={() => {
                    if (recoveryInProgress) {
                        setShowOverlay(true)
                        return
                    }

                    navigation.navigate('ChatWallet', {
                        recipientId,
                    })
                }}>
                <SvgImage
                    name="Wallet"
                    containerStyle={{
                        marginRight: theme.spacing.md,
                        marginBottom: theme.spacing.sm,
                    }}
                    size={SvgImageSize.md}
                    color={
                        recoveryInProgress
                            ? theme.colors.primaryVeryLight
                            : theme.colors.primary
                    }
                />
            </Pressable>

            <RecoveryInProgressOverlay
                show={showOverlay}
                onDismiss={() => setShowOverlay(false)}
                label={t('feature.recovery.recovery-in-progress-chat-payments')}
            />
        </>
    )
}

export default ChatWalletButton
