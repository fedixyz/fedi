import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'

import { OmniInput } from '../components/feature/omni/OmniInput'
import { useOmniLinkContext } from '../state/contexts/OmniLinkContext'
import { ParserDataType } from '../types'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'NewMessage'>

const NewMessage: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const toast = useToast()
    const { setParsedLink } = useOmniLinkContext()

    return (
        <View style={styles().container}>
            <OmniInput
                expectedInputTypes={[
                    ParserDataType.LegacyFediChatMember,
                    ParserDataType.LegacyFediChatGroup,
                    ParserDataType.FediChatUser,
                    ParserDataType.FediChatRoom,
                ]}
                onExpectedInput={parsedData => {
                    if (
                        parsedData.type ===
                            ParserDataType.LegacyFediChatGroup ||
                        parsedData.type === ParserDataType.LegacyFediChatMember
                    ) {
                        return toast.show({
                            content: t('feature.omni.unsupported-legacy-chat'),
                            status: 'error',
                        })
                    }
                    if (parsedData.type === ParserDataType.FediChatUser) {
                        navigation.replace('ChatUserConversation', {
                            userId: parsedData.data.id,
                            displayName: parsedData.data.displayName,
                        })
                    } else if (
                        parsedData.type === ParserDataType.FediChatRoom
                    ) {
                        setParsedLink(parsedData)
                    }
                }}
                onUnexpectedSuccess={() =>
                    navigation.canGoBack()
                        ? navigation.goBack()
                        : navigation.navigate('TabsNavigator')
                }
                customActions={[
                    {
                        label: t('feature.chat.create-a-group'),
                        icon: 'SocialPeople',
                        onPress: () => navigation.push('CreateGroup', {}),
                    },
                ]}
            />
        </View>
    )
}

const styles = () =>
    StyleSheet.create({
        container: {
            flex: 1,
            width: '100%',
            flexDirection: 'column',
        },
    })

export default NewMessage
