import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { useToast } from '@fedi/common/hooks/toast'

import { OmniInput } from '../components/feature/omni/OmniInput'
import Flex from '../components/ui/Flex'
import { useOmniLinkContext } from '../state/contexts/OmniLinkContext'
import { ParserDataType } from '../types'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'NewMessage'>

const NewMessage: React.FC<Props> = ({ navigation, route }: Props) => {
    const { t } = useTranslation()
    const toast = useToast()
    const { setParsedLink } = useOmniLinkContext()
    const initialInputMethod = route.params?.initialInputMethod || 'scan'

    return (
        <Flex grow fullWidth>
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
                        : navigation.navigate('TabsNavigator', {
                              initialRouteName: 'Chat',
                          })
                }
                customActions={[
                    {
                        label: t('feature.chat.create-a-group'),
                        icon: 'SocialPeople',
                        onPress: () => navigation.push('CreateGroup', {}),
                    },
                ]}
                initialInputMethod={initialInputMethod}
            />
        </Flex>
    )
}

export default NewMessage
