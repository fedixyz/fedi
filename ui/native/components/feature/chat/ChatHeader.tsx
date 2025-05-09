import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

// import { useNuxStep } from '@fedi/common/hooks/nux'
// import { selectIsMatrixChatEmpty } from '@fedi/common/redux'
// import { useAppSelector } from '../../../state/hooks'
import { NavigationHook } from '../../../types/navigation'
import Header from '../../ui/Header'
// import { Tooltip } from '../../ui/Tooltip'
import { ChatConnectionBadge } from './ChatConnectionBadge'
import HeaderAvatar from './HeaderAvatar'

const ChatHeader: React.FC = () => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()
    // const isChatEmpty = useAppSelector(selectIsMatrixChatEmpty)
    // const [hasViewedMemberQr, completeViewedMemberQr] =
    //     useNuxStep('hasViewedMemberQr')

    const style = useMemo(() => styles(theme), [theme])

    return (
        <>
            <Header
                containerStyle={style.container}
                headerLeft={
                    <Text h2 medium numberOfLines={1} adjustsFontSizeToFit>
                        {t('words.chat')}
                    </Text>
                }
                headerRight={
                    <>
                        <HeaderAvatar
                            onPress={() => {
                                navigation.navigate('Settings')
                                //completeViewedMemberQr()
                            }}
                        />
                        {/* <Tooltip
                            delay={600}
                            shouldShow={isChatEmpty && !hasViewedMemberQr}
                            orientation="below"
                            side="right"
                            text={t('phrases.your-username')}
                            horizontalOffset={20}
                            verticalOffset={34}
                        /> */}
                    </>
                }
            />
            <ChatConnectionBadge />
        </>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            paddingBottom: theme.spacing.md,
        },
    })

export default ChatHeader
