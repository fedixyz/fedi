import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { useNuxStep } from '@fedi/common/hooks/nux'
import { selectIsMatrixChatEmpty } from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import { NavigationHook } from '../../../types/navigation'
import GradientView from '../../ui/GradientView'
import Header from '../../ui/Header'
import MainHeaderButtons from '../../ui/MainHeaderButtons'
import { Tooltip } from '../../ui/Tooltip'
import TotalBalance from '../../ui/TotalBalance'
import { ChatConnectionBadge } from './ChatConnectionBadge'

const ChatHeader: React.FC = () => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()

    const isChatEmpty = useAppSelector(selectIsMatrixChatEmpty)
    const [hasOpenedNewChat, completeOpenedNewChat] =
        useNuxStep('hasOpenedNewChat')

    const style = useMemo(() => styles(theme), [theme])

    const goToNewMessage = () => {
        navigation.navigate('NewMessage')
        completeOpenedNewChat()
    }

    const handleSearch = () => {
        navigation.navigate('ChatsListSearch', { initialQuery: '' })
    }

    return (
        <>
            <GradientView variant="sky" style={style.container}>
                <Header
                    transparent
                    containerStyle={style.headerContainer}
                    headerLeft={
                        <Text h2 medium numberOfLines={1} adjustsFontSizeToFit>
                            {t('words.chat')}
                        </Text>
                    }
                    headerRight={
                        <MainHeaderButtons
                            onAddPress={goToNewMessage}
                            onSearchPress={handleSearch}
                        />
                    }
                />
                <TotalBalance />
            </GradientView>
            <ChatConnectionBadge />
            <Tooltip
                shouldShow={isChatEmpty && !hasOpenedNewChat}
                delay={1200}
                text={t('feature.chat.new-chat')}
                orientation="below"
                side="right"
                horizontalOffset={128}
                verticalOffset={110}
            />
        </>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            paddingHorizontal: theme.spacing.lg,
            display: 'flex',
            gap: theme.spacing.xs,
            paddingBottom: theme.spacing.md,
        },
        headerContainer: {
            paddingHorizontal: 0,
        },
    })

export default ChatHeader
