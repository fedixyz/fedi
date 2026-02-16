import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'
import { ScrollView } from 'react-native-gesture-handler'

import { theme as fediTheme } from '@fedi/common/constants/theme'
import { useMatrixUserSearch } from '@fedi/common/hooks/matrix'
import { selectMatrixContactsList } from '@fedi/common/redux'

import { ReceiverType } from '../../../screens/StabilityTransfer'
import { useAppSelector } from '../../../state/hooks'
import { MatrixUser } from '../../../types'
import { Column } from '../../ui/Flex'
import FullModalOverlay from '../../ui/FullModalOverlay'
import { PressableIcon } from '../../ui/PressableIcon'
import SvgImage from '../../ui/SvgImage'
import ChatUserTile from '../chat/ChatUserTile'
import SearchBar from '../chat/SearchBar'

const RecipientSelectorOverlay: React.FC<{
    opened: boolean
    onDismiss: () => void
    onSelect: (receiver: ReceiverType | null) => void
}> = ({ opened, onDismiss, onSelect }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const style = styles(theme)
    const contacts = useAppSelector(selectMatrixContactsList)

    const { query, setQuery, searchedUsers } = useMatrixUserSearch()
    const navigation = useNavigation()
    const openOmniScanner = useCallback(() => {
        navigation.navigate('OmniScanner')
        onDismiss()
    }, [navigation, onDismiss])

    const handleSelectMember = useCallback(
        (member: ReceiverType | null) => {
            requestAnimationFrame(() => {
                onSelect(member)
                onDismiss()
            })
        },
        [onSelect, onDismiss],
    )

    const renderChatUser = (member: MatrixUser) => {
        return (
            <ChatUserTile
                key={member.id}
                user={member}
                selectUser={() => handleSelectMember(member)}
                showSuffix={true}
            />
        )
    }

    return (
        <FullModalOverlay
            show={opened}
            onBackdropPress={onDismiss}
            contents={{
                body: (
                    <ScrollView
                        style={style.container}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={style.contentContainer}>
                        <SearchBar
                            autoFocus={false}
                            query={query}
                            setQuery={setQuery}
                            clearSearch={() => setQuery('')}
                            placeholder={t('feature.chat.find-by-username')}
                            leftIcon={
                                <SvgImage name="Search" size={theme.sizes.sm} />
                            }
                            rightIcon={
                                <PressableIcon
                                    svgName="Scan"
                                    onPress={openOmniScanner}
                                    svgProps={{
                                        size: theme.sizes.sm,
                                    }}
                                />
                            }
                            textStyle={style.searchText}
                            containerStyle={style.searchContainer}
                            inputContainerStyle={style.searchContentContainer}
                        />
                        {searchedUsers.length > 0 ? (
                            searchedUsers.map(member => renderChatUser(member))
                        ) : query.length > 0 ? (
                            <Column
                                align="center"
                                justify="center"
                                gap={theme.spacing.sm}
                                style={style.emptyState}>
                                <SvgImage
                                    name="SearchNoResult"
                                    size={32}
                                    color={theme.colors.primary}
                                />
                                <Text bold style={style.emptyText}>
                                    {t('phrases.no-result')}
                                </Text>
                            </Column>
                        ) : (
                            contacts.map(member => renderChatUser(member))
                        )}
                    </ScrollView>
                ),
            }}
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            minHeight: '100%',
            flexShrink: 0,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.md,
        },
        contentContainer: {
            justifyContent: 'center',
            alignItems: 'flex-start',
            width: '100%',
        },
        searchContainer: {
            width: '100%',
            borderColor: theme.colors.primaryVeryLight,
            borderWidth: 1,
            borderRadius: theme.borders.defaultRadius,
            height: undefined,
        },
        searchContentContainer: {
            borderBottomWidth: 0,
            height: '100%',
        },
        searchText: {
            fontSize: fediTheme.fontSizes.caption,
            marginTop: 0,
        },
        emptyState: {
            height: '100%',
            margin: 'auto',
            paddingHorizontal: theme.spacing.xl,
        },
        emptyText: {
            color: theme.colors.grey,
            textAlign: 'center',
        },
    })

export default RecipientSelectorOverlay
