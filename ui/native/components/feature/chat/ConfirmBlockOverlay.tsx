import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { MatrixRoomMember } from '@fedi/common/types'
import { getUserSuffix } from '@fedi/common/utils/matrix'

import CustomOverlay from '../../ui/CustomOverlay'

interface ConfirmBlockOverlayProps {
    show: boolean
    isIgnored: boolean
    confirming: boolean
    onConfirm: () => void
    onDismiss: () => void
    user: Pick<MatrixRoomMember, 'id' | 'displayName' | 'avatarUrl'>
}

export const ConfirmBlockOverlay: React.FC<ConfirmBlockOverlayProps> = ({
    show,
    confirming,
    onConfirm,
    onDismiss,
    user,
    isIgnored,
}) => {
    const { t } = useTranslation()
    const username = user.displayName
    const fullUsername = `${username}${getUserSuffix(user.id)}`
    const { theme } = useTheme()
    const style = styles(theme)
    return (
        <CustomOverlay
            show={show}
            onBackdropPress={onDismiss}
            loading={confirming}
            contents={{
                body: (
                    <View style={style.titleContainer}>
                        <Text
                            medium
                            numberOfLines={2}
                            adjustsFontSizeToFit
                            style={style.text}>
                            {isIgnored
                                ? t('feature.chat.confirm-unblock-user', {
                                      username: fullUsername,
                                  })
                                : t('feature.chat.confirm-block-user', {
                                      username: fullUsername,
                                  })}
                        </Text>
                        {!isIgnored && (
                            <Text
                                caption
                                numberOfLines={1}
                                adjustsFontSizeToFit>
                                {t('feature.chat.confirm-block-user-subtitle', {
                                    username,
                                })}
                            </Text>
                        )}
                    </View>
                ),
                icon: 'AlertWarningTriangle',
                buttons: [
                    {
                        text: t('words.no'),
                        onPress: onDismiss,
                    },
                    {
                        text: isIgnored
                            ? t('phrases.yes-unblock')
                            : t('phrases.yes-block'),
                        warning: true,
                        onPress: onConfirm,
                    },
                ],
            }}
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        titleContainer: {
            paddingTop: theme.spacing.lg,
            paddingHorizontal: theme.spacing.sm,
            alignItems: 'center',
            gap: theme.spacing.sm,
        },
        text: {
            textAlign: 'center',
        },
    })
