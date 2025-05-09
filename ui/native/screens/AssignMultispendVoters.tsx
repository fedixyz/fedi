import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Input, Text, Theme, useTheme } from '@rneui/themed'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'
import { ScrollView } from 'react-native-gesture-handler'

import {
    selectMatrixAuth,
    selectMatrixRoomMembersByMe,
} from '@fedi/common/redux'
import { getUserSuffix } from '@fedi/common/utils/matrix'

import ChatAvatar from '../components/feature/chat/ChatAvatar'
import { AvatarSize } from '../components/ui/Avatar'
import CheckBox from '../components/ui/CheckBox'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import SvgImage from '../components/ui/SvgImage'
import { useAppSelector } from '../state/hooks'
import { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'AssignMultispendVoters'
>

const AssignMultispendVoters: React.FC<Props> = ({ navigation, route }) => {
    const { roomId, voters } = route.params

    const matrixAuth = useAppSelector(selectMatrixAuth)
    const myId = matrixAuth?.userId
    const [selectedVoters, setSelectedVoters] = useState<string[]>(voters ?? [])
    const [search, setSearch] = useState('')
    const { theme } = useTheme()
    const { t } = useTranslation()
    const members = useAppSelector(s => selectMatrixRoomMembersByMe(s, roomId))

    const handleSubmit = useCallback(() => {
        navigation.navigate('CreateMultispend', {
            roomId,
            voters: selectedVoters,
        })
    }, [navigation, roomId, selectedVoters])

    const toggleMember = useCallback((memberId: string) => {
        setSelectedVoters(selected => {
            if (selected.includes(memberId))
                return selected.filter(v => v !== memberId)

            if (selected.length < 21) return [...selected, memberId]

            return selected
        })
    }, [])

    const filteredMembers = useMemo(
        () =>
            members.filter(m =>
                m.displayName?.toLowerCase().includes(search.toLowerCase()),
            ),
        [members, search],
    )

    // The creator of the multispend should be automatically selected
    useEffect(() => {
        if (myId && !selectedVoters.includes(myId))
            setSelectedVoters(prev => [myId, ...prev])
    }, [myId, selectedVoters])

    const style = styles(theme)

    return (
        <SafeAreaContainer edges="notop" style={style.container}>
            <View style={style.content}>
                <Input
                    leftIcon={
                        <SvgImage
                            name="MoodSearch"
                            size={20}
                            containerStyle={style.searchIcon}
                        />
                    }
                    inputContainerStyle={style.searchInputStyle}
                    containerStyle={style.searchInputContainerStyle}
                    value={search}
                    onChangeText={setSearch}
                    placeholder={t('words.search')}
                    autoCapitalize="none"
                    autoCorrect={false}
                />
                <ScrollView
                    style={style.memberList}
                    contentContainerStyle={style.memberListContainer}
                    alwaysBounceVertical={false}>
                    {filteredMembers.map(m => (
                        <Pressable
                            key={m.id}
                            style={style.memberItem}
                            onPress={() => toggleMember(m.id)}
                            disabled={myId === m.id}>
                            <ChatAvatar user={m} size={AvatarSize.sm} />
                            <Text caption bold>
                                {m.displayName}
                            </Text>
                            <Text
                                numberOfLines={1}
                                bold
                                caption
                                style={style.memberSuffix}>
                                {getUserSuffix(m.id)}
                            </Text>
                            <CheckBox
                                checked={selectedVoters.includes(m.id)}
                                containerStyle={style.checkbox}
                                checkedIcon={
                                    <SvgImage
                                        name="CheckboxChecked"
                                        size={32}
                                    />
                                }
                                disabled={myId === m.id}
                                disabledStyle={{ opacity: 0.5 }}
                                uncheckedIcon={
                                    <SvgImage
                                        name="CheckboxUnchecked"
                                        size={32}
                                    />
                                }
                                // Checkboxes aren't inheriting the Pressable's onPress
                                // In order to be clickable, needs to be passed here
                                onPress={
                                    // When disabled, checkboxes are still clickable for some reason
                                    myId !== m.id
                                        ? () => toggleMember(m.id)
                                        : undefined
                                }
                            />
                        </Pressable>
                    ))}
                </ScrollView>
                {selectedVoters.length > 0 && (
                    <View style={style.selectedVotersIndicator}>
                        <View style={style.selectedVotersBadge}>
                            <Text small>
                                <Trans
                                    i18nKey="feature.multispend.n-voters-selected-max"
                                    values={{ count: selectedVoters.length }}
                                    components={{
                                        bold: <Text bold small />,
                                    }}
                                />
                            </Text>
                        </View>
                    </View>
                )}
            </View>
            <Button onPress={handleSubmit} disabled={selectedVoters.length < 2}>
                {t('words.confirm')}
            </Button>
        </SafeAreaContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            gap: theme.spacing.lg,
            paddingTop: theme.spacing.md,
        },
        content: {
            flex: 1,
            gap: theme.spacing.lg,
        },
        searchIcon: {
            marginRight: theme.spacing.xs,
        },
        searchInputStyle: {
            borderBottomWidth: 0,
            height: '100%',
        },
        searchInputContainerStyle: {
            width: '100%',
            borderColor: theme.colors.primaryVeryLight,
            borderWidth: 1.5,
            borderRadius: 8,
            height: 48,
        },
        memberList: {
            flex: 1,
        },
        memberListContainer: {
            gap: theme.spacing.md,
            paddingHorizontal: theme.spacing.sm,
        },
        memberItem: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
        },
        memberSuffix: {
            color: theme.colors.grey,
            flex: 1,
        },
        checkbox: {
            padding: 0,
            margin: 0,
        },
        selectedVotersIndicator: {
            alignItems: 'center',
        },
        selectedVotersBadge: {
            backgroundColor: theme.colors.offWhite,
            borderRadius: 4,
            padding: theme.spacing.sm,
        },
    })

export default AssignMultispendVoters
