import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Input, Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context'

import { useToast } from '@fedi/common/hooks/toast'
import {
    configureChatGroup,
    selectActiveFederationId,
    selectChatGroup,
} from '@fedi/common/redux'

import HoloAvatar, { AvatarSize } from '../components/ui/HoloAvatar'
import KeyboardAwareWrapper from '../components/ui/KeyboardAwareWrapper'
import { DEFAULT_GROUP_NAME } from '../constants'
import { useAppDispatch, useAppSelector, usePrevious } from '../state/hooks'
import { resetAfterGroupNameUpdate } from '../state/navigation'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'EditGroup'>

const EditGroup: React.FC<Props> = ({ navigation, route }: Props) => {
    const insets = useSafeAreaInsets()
    const { theme } = useTheme()
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const activeFederationId = useAppSelector(selectActiveFederationId)
    const { groupId } = route.params
    const group = useAppSelector(s => selectChatGroup(s, groupId))
    const [groupName, setGroupName] = useState<string>(
        group?.name || DEFAULT_GROUP_NAME,
    )
    const [editingGroupName, setEditingGroupName] = useState<boolean>(false)
    const toast = useToast()

    const currentGroup = group
    const previousGroup = usePrevious(currentGroup)

    const handleSubmit = async () => {
        setEditingGroupName(true)
    }

    useEffect(() => {
        const handleEditGroupName = async () => {
            try {
                if (!activeFederationId || !group) return
                await dispatch(
                    configureChatGroup({
                        federationId: activeFederationId as string,
                        groupId,
                        groupName: groupName,
                    }),
                ).unwrap()
            } catch (error) {
                toast.error(t, error)
            }
            setEditingGroupName(false)
        }
        if (editingGroupName === true) {
            handleEditGroupName()
        }
    }, [
        activeFederationId,
        dispatch,
        editingGroupName,
        group,
        groupId,
        groupName,
        toast,
        t,
    ])

    useEffect(() => {
        if (
            currentGroup?.name &&
            previousGroup?.name &&
            currentGroup?.name !== previousGroup?.name
        ) {
            setEditingGroupName(false)
            navigation.dispatch(resetAfterGroupNameUpdate(currentGroup.id))
        }
    }, [currentGroup, previousGroup, navigation])

    return (
        <KeyboardAwareWrapper>
            <View style={styles(theme, insets).container}>
                <HoloAvatar title={groupName[0]} size={AvatarSize.md} />
                <View style={styles(theme, insets).inputWrapper}>
                    <Text caption style={styles(theme, insets).inputLabel}>
                        {t('feature.chat.group-name')}
                    </Text>
                    <Input
                        onChangeText={setGroupName}
                        value={groupName}
                        placeholder={`${t('feature.chat.group-name')}`}
                        returnKeyType="done"
                        containerStyle={styles(theme, insets).textInputOuter}
                        inputContainerStyle={
                            styles(theme, insets).textInputInner
                        }
                        autoCapitalize={'none'}
                        autoCorrect={false}
                    />
                </View>
                <Button
                    fullWidth
                    title={t('phrases.save-changes')}
                    onPress={handleSubmit}
                    loading={editingGroupName}
                    disabled={!groupName || editingGroupName}
                    containerStyle={styles(theme, insets).button}
                />
            </View>
        </KeyboardAwareWrapper>
    )
}

const styles = (theme: Theme, insets: EdgeInsets) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.xl,
            paddingBottom: theme.spacing.xl + insets.bottom,
            width: '100%',
        },
        button: {
            marginTop: 'auto',
        },
        inputWrapper: {
            width: '100%',
            marginTop: theme.spacing.xl,
        },
        inputLabel: {
            textAlign: 'left',
            marginLeft: theme.spacing.sm,
            marginBottom: theme.spacing.xs,
        },
        textInputInner: {
            borderBottomWidth: 0,
            height: '100%',
        },
        textInputOuter: {
            width: '100%',
            borderColor: theme.colors.primaryVeryLight,
            borderWidth: 1,
            borderRadius: theme.borders.defaultRadius,
        },
    })

export default EditGroup
