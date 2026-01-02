import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { useNuxStep } from '@fedi/common/hooks/nux'
import { selectIsMatrixChatEmpty, selectMatrixAuth } from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import { NavigationHook } from '../../../types/navigation'
import CustomOverlay from '../../ui/CustomOverlay'
import { Column } from '../../ui/Flex'
import GradientView from '../../ui/GradientView'
import Header from '../../ui/Header'
import MainHeaderButtons from '../../ui/MainHeaderButtons'
import { Tooltip } from '../../ui/Tooltip'
import TotalBalance from '../../ui/TotalBalance'
import { ChatConnectionBadge } from './ChatConnectionBadge'
import HeaderOverlayOption from './HeaderOverlayOption'

const ChatHeader: React.FC = () => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()

    const matrixAuth = useAppSelector(selectMatrixAuth)
    const isChatEmpty = useAppSelector(selectIsMatrixChatEmpty)
    const [hasOpenedNewChat, completeOpenedNewChat] =
        useNuxStep('hasOpenedNewChat')
    const [optionsOverlayOpen, setOptionsOverlayOpen] = useState(false)

    const style = useMemo(() => styles(theme), [theme])

    const shouldShowNewChatTooltip =
        isChatEmpty && !hasOpenedNewChat && matrixAuth !== null

    const handleSearch = () => {
        navigation.navigate('ChatsListSearch', { initialQuery: '' })
    }

    const handleFindByUsername = () => {
        setOptionsOverlayOpen(false)
        navigation.navigate('NewMessage', { initialInputMethod: 'search' })
    }

    const handleCreateGroup = () => {
        setOptionsOverlayOpen(false)
        navigation.navigate('CreateGroup', {})
    }

    const handleScanOrPaste = () => {
        setOptionsOverlayOpen(false)
        navigation.navigate('NewMessage', { initialInputMethod: 'scan' })
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
                            onAddPress={
                                matrixAuth
                                    ? () => {
                                          setOptionsOverlayOpen(true)
                                          completeOpenedNewChat()
                                      }
                                    : undefined
                            }
                            onSearchPress={
                                matrixAuth ? handleSearch : undefined
                            }
                        />
                    }
                />
                <TotalBalance />
            </GradientView>
            <ChatConnectionBadge />
            <Tooltip
                shouldShow={shouldShowNewChatTooltip}
                delay={1200}
                text={t('feature.chat.new-chat')}
                orientation="below"
                side="right"
                horizontalOffset={128}
                verticalOffset={110}
            />
            <CustomOverlay
                show={optionsOverlayOpen}
                onBackdropPress={() => setOptionsOverlayOpen(false)}
                contents={{
                    body: (
                        <Column>
                            <HeaderOverlayOption
                                onPress={handleFindByUsername}
                                text={t('feature.chat.find-by-username')}
                                icon="User"
                            />
                            <HeaderOverlayOption
                                onPress={handleCreateGroup}
                                text={t('feature.chat.create-a-group')}
                                icon="SocialPeople"
                            />
                            <HeaderOverlayOption
                                onPress={handleScanOrPaste}
                                text={t('phrases.scan-or-paste')}
                                icon="Scan"
                            />
                        </Column>
                    ),
                }}
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
