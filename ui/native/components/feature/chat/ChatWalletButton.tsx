import { useNavigation } from '@react-navigation/native'
import { useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import {
    selectChatMember,
    selectIsActiveFederationRecovering,
} from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import { NavigationHook } from '../../../types/navigation'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'
import { RecoveryInProgressOverlay } from '../recovery/RecoveryInProgressOverlay'

type ChatWalletButtonProps = {
    memberId: string
}

const ChatWalletButton: React.FC<ChatWalletButtonProps> = ({
    memberId,
}: ChatWalletButtonProps) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()
    const [showOverlay, setShowOverlay] = useState(false)
    const toast = useToast()
    const member = useAppSelector(s => selectChatMember(s, memberId))
    const recoveryInProgress = useAppSelector(
        selectIsActiveFederationRecovering,
    )

    return (
        <>
            <Pressable
                onPress={() => {
                    if (!member) {
                        toast.show({
                            content: t('errors.chat-member-not-found'),
                            status: 'error',
                        })
                        return
                    }
                    if (recoveryInProgress) {
                        setShowOverlay(true)
                        return
                    }

                    navigation.navigate('ChatWallet', {
                        recipientId: memberId,
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
                        member
                            ? theme.colors.primary
                            : theme.colors.primaryVeryLight
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
