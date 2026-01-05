import { useNavigation } from '@react-navigation/native'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { NavigationHook } from '../../../types/navigation'
import { Column } from '../../ui/Flex'

type Props = {
    roomId: string
    isBroadcast?: boolean
}

const NoMembersNotice: React.FC<Props> = ({
    isBroadcast = false,
    roomId,
}: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()

    return (
        <Column grow center>
            {isBroadcast ? (
                <Text medium style={styles(theme).text}>
                    {t('feature.chat.broadcast-no-message')}
                </Text>
            ) : (
                <Text medium style={styles(theme).text}>
                    {t('feature.chat.no-one-is-in-this-group')}
                    {'\r'}
                    {t('feature.chat.try-inviting-someone')}
                </Text>
            )}
            <Button
                containerStyle={styles(theme).button}
                title={t('feature.chat.invite-to-group')}
                onPress={() =>
                    navigation.navigate('ChatRoomInvite', { roomId })
                }
            />
        </Column>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        icon: {
            height: theme.sizes.lg,
            width: theme.sizes.lg,
            marginTop: theme.spacing.xl,
            paddingTop: theme.spacing.xl,
            marginBottom: theme.spacing.md,
        },
        text: {
            maxWidth: 320,
            color: theme.colors.grey,
            textAlign: 'center',
            lineHeight: 20,
            fontFamily: 'AlbertSans',
            letterSpacing: 0.5,
            paddingHorizontal: theme.spacing.xl,
        },
        button: {
            marginTop: theme.spacing.lg,
            width: '80%',
        },
    })

export default NoMembersNotice
