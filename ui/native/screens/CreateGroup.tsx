import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Input, Switch, Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useCreateMatrixRoom } from '@fedi/common/hooks/matrix'
import { ChatType, MatrixRoom } from '@fedi/common/types'

import Avatar, { AvatarSize } from '../components/ui/Avatar'
import { Row, Column } from '../components/ui/Flex'
import KeyboardAwareWrapper from '../components/ui/KeyboardAwareWrapper'
import { SafeAreaContainer, SafeScrollArea } from '../components/ui/SafeArea'
import type { RootStackParamList } from '../types/navigation'
import { useImeFooterLift, useIosKeyboardOpen } from '../utils/hooks/keyboard'

export type Props = NativeStackScreenProps<RootStackParamList, 'CreateGroup'>

const CreateGroup: React.FC<Props> = ({ navigation, route }: Props) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const insets = useSafeAreaInsets()
    const defaultGroup = route.params?.defaultGroup || undefined
    const {
        handleCreateGroup,
        isCreatingGroup,
        groupName,
        setGroupName,
        broadcastOnly,
        setBroadcastOnly,
        isPublic,
        setIsPublic,
        errorMessage,
    } = useCreateMatrixRoom(t, (roomId: MatrixRoom['id']) => {
        navigation.replace('ChatRoomConversation', {
            roomId,
            chatType: ChatType.group,
        })
    })

    // Forces default groups to be broadcast-only & public
    // TODO: support nonbroadcast/nonpublic default groups
    useEffect(() => {
        if (defaultGroup === true) {
            setBroadcastOnly(true)
            setIsPublic(true)
        }
    }, [defaultGroup, setBroadcastOnly, setIsPublic])

    const icon = useMemo(() => {
        return broadcastOnly ? 'SpeakerPhone' : 'SocialPeople'
    }, [broadcastOnly])

    const style = styles(theme)
    const openIOS = useIosKeyboardOpen(80)
    const extraPadAndroid35 = useImeFooterLift()

    return (
        <KeyboardAwareWrapper>
            <SafeAreaContainer edges="none">
                <View style={style.outerContainer}>
                    <SafeScrollArea
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="on-drag"
                        contentInsetAdjustmentBehavior="never"
                        contentContainerStyle={style.scrollContent}
                        showsVerticalScrollIndicator={false}
                        edges="none"
                        safeAreaContainerStyle={style.safeAreaContainer}
                        style={style.container}>
                        <Column align="center" justify="start" fullWidth>
                            <Avatar id={''} icon={icon} size={AvatarSize.md} />

                            <View style={style.inputWrapper}>
                                <Input
                                    onChangeText={setGroupName}
                                    value={groupName}
                                    maxLength={30}
                                    placeholder={`${t('feature.chat.group-name')}`}
                                    returnKeyType="done"
                                    containerStyle={style.textInputOuter}
                                    inputContainerStyle={style.textInputInner}
                                    autoCapitalize={'none'}
                                    autoCorrect={false}
                                    selectTextOnFocus
                                    errorMessage={errorMessage ?? undefined}
                                />
                            </View>

                            <Row
                                align="center"
                                justify="between"
                                fullWidth
                                style={style.switchWrapper}>
                                <Text style={style.inputLabel}>
                                    {t('feature.chat.broadcast-only')}
                                </Text>
                                <Switch
                                    value={broadcastOnly}
                                    onValueChange={value => {
                                        // for now default groups must be public
                                        if (defaultGroup === true) return
                                        setBroadcastOnly(value)
                                    }}
                                />
                            </Row>

                            <Row
                                align="center"
                                justify="between"
                                fullWidth
                                style={style.switchWrapper}>
                                <Text style={style.inputLabel}>
                                    {t('words.public')}
                                </Text>
                                <Switch
                                    value={isPublic}
                                    onValueChange={value => {
                                        // for now default groups must be public
                                        if (defaultGroup === true) return
                                        setIsPublic(value)
                                    }}
                                />
                            </Row>

                            {isPublic && (
                                <Text caption style={style.errorLabel}>
                                    {t('feature.chat.public-group-warning')}
                                </Text>
                            )}
                        </Column>
                    </SafeScrollArea>

                    <View
                        style={[
                            style.footer,
                            {
                                paddingBottom:
                                    insets.bottom +
                                    theme.spacing.lg +
                                    (openIOS ? 40 : 0) +
                                    extraPadAndroid35,
                            },
                        ]}>
                        <Button
                            fullWidth
                            title={t('phrases.save-changes')}
                            onPress={handleCreateGroup}
                            loading={isCreatingGroup}
                            disabled={
                                !groupName || isCreatingGroup || !!errorMessage
                            }
                        />
                    </View>
                </View>
            </SafeAreaContainer>
        </KeyboardAwareWrapper>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        outerContainer: {
            flex: 1,
        },
        container: {
            flex: 1,
            width: '100%',
        },
        scrollContent: {
            flexGrow: 1,
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.lg,
            paddingBottom: theme.spacing.xl + 120,
        },
        footer: {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: theme.spacing.lg,
            backgroundColor: theme.colors?.background,
        },
        errorLabel: {
            textAlign: 'left',
            marginTop: theme.spacing.sm,
            color: theme.colors.red,
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
        switchWrapper: {
            marginTop: theme.spacing.xl,
            paddingHorizontal: 10,
        },
        textInputInner: {
            textAlignVertical: 'center',
            borderColor: theme.colors.primaryVeryLight,
            borderWidth: 1,
            borderRadius: theme.borders.defaultRadius,
            padding: theme.spacing.sm,
            paddingHorizontal: theme.spacing.md,
        },
        textInputOuter: {
            width: '100%',
        },
        safeAreaContainer: {
            paddingTop: 0,
        },
    })

export default CreateGroup
