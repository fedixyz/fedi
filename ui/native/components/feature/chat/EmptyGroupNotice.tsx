import { useNavigation, useRoute } from '@react-navigation/native'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { Props as GroupChatProps } from '../../../screens/GroupChat'
import { NavigationHook } from '../../../types/navigation'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

type GroupChatRouteProp = GroupChatProps['route']

const EmptyGroupNotice: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()
    const route = useRoute<GroupChatRouteProp>()
    const { groupId } = route.params

    return (
        <View style={styles(theme).container}>
            <SvgImage
                name="Search"
                size={SvgImageSize.lg}
                color={theme.colors.primaryLight}
                containerStyle={{
                    marginTop: theme.spacing.xl,
                    paddingTop: theme.spacing.xl,
                    paddingBottom: theme.spacing.md,
                }}
            />
            <Text medium style={styles(theme).text}>
                {t('feature.chat.no-one-is-in-this-group')}
            </Text>
            <Text medium style={styles(theme).text}>
                {t('feature.chat.try-inviting-someone')}
            </Text>
            <Button
                containerStyle={styles(theme).button}
                title={t('feature.chat.invite-to-group')}
                onPress={() => navigation.navigate('GroupInvite', { groupId })}
            />
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingTop: theme.spacing.xxl,
            marginTop: theme.spacing.xxl,
        },
        icon: {
            height: theme.sizes.lg,
            width: theme.sizes.lg,
            marginTop: theme.spacing.xl,
            paddingTop: theme.spacing.xl,
            marginBottom: theme.spacing.md,
        },
        text: {
            color: theme.colors.primaryLight,
            textAlign: 'center',
            marginVertical: theme.spacing.xs,
        },
        button: {
            marginTop: theme.spacing.lg,
            width: '80%',
        },
    })

export default EmptyGroupNotice
