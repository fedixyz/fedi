import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { OmniInput } from '../components/feature/omni/OmniInput'
import { ParserDataType } from '../types'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'NewMessage'>

const NewMessage: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()

    return (
        <View style={styles().container}>
            <OmniInput
                expectedInputTypes={[
                    ParserDataType.FediChatMember,
                    ParserDataType.FediChatGroup,
                ]}
                onExpectedInput={parsedData => {
                    if (parsedData.type === ParserDataType.FediChatMember) {
                        navigation.replace('DirectChat', {
                            memberId: parsedData.data.id,
                        })
                    }
                    if (parsedData.type === ParserDataType.FediChatGroup) {
                        navigation.replace('GroupChat', {
                            groupId: parsedData.data.id,
                        })
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
                        onPress: () => navigation.push('CreateGroup'),
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
