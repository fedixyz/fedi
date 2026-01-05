import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Switch, Text, Theme, useTheme } from '@rneui/themed'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet } from 'react-native'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'

import { FieldInput } from '../components/ui/FieldInput'
import Flex from '../components/ui/Flex'
import { PressableIcon } from '../components/ui/PressableIcon'
import { SafeScrollArea } from '../components/ui/SafeArea'
import SvgImage from '../components/ui/SvgImage'
import { RootStackParamList } from '../types/navigation'

type Props = NativeStackScreenProps<RootStackParamList, 'CreatePoll'>

interface PollOption {
    text: string
    id: number
}

const CreatePoll: React.FC<Props> = ({
    navigation,
    route: {
        params: { roomId },
    },
}) => {
    const { theme } = useTheme()
    const { t } = useTranslation()

    const [question, setQuestion] = useState('')
    const [options, setOptions] = useState<Array<PollOption>>([
        { text: '', id: 0 },
        { text: '', id: 1 },
        { text: '', id: 2 },
    ])
    const [isMultipleChoice, setIsMultipleChoice] = useState(false)
    const [isDisclosed, setIsDisclosed] = useState(true)
    const [isLoading, setIsLoading] = useState(false)
    const style = styles(theme)
    const fedimint = useFedimint()
    const toast = useToast()

    const handleAddOption = () => {
        if (options.length < 6) {
            setOptions([...options, { text: '', id: Date.now() }])
        }
    }

    const handleOptionChange = (option: PollOption, text: string) => {
        setOptions(options.map(o => (o.id === option.id ? { ...o, text } : o)))
    }

    const handleRemoveOption = (option: PollOption) => {
        if (options.length > 2) {
            setOptions(options.filter(o => o.id !== option.id))
        }
    }

    const canSubmit =
        question.length > 0 && options.every(o => o.text.length > 0)

    const handleCreatePoll = async () => {
        if (!canSubmit) return
        setIsLoading(true)

        try {
            await fedimint.matrixStartPoll(
                roomId,
                question,
                options.map(o => o.text),
                isMultipleChoice,
                isDisclosed,
            )

            navigation.goBack()
        } catch (e) {
            toast.error(t, e, 'errors.unknown-error')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <SafeScrollArea
            contentContainerStyle={style.container}
            safeAreaContainerStyle={style.content}
            edges="bottom">
            <FieldInput
                label={t('words.question')}
                value={question}
                onChangeText={setQuestion}
            />
            <Flex gap="sm">
                <Text small style={style.optionsLabel}>
                    {t('words.options')}
                </Text>
                <Flex gap="sm">
                    {options.map(option => (
                        <Flex row align="center" gap="sm" key={option.id}>
                            <Flex grow>
                                <FieldInput
                                    value={option.text}
                                    onChangeText={text =>
                                        handleOptionChange(option, text)
                                    }
                                />
                            </Flex>
                            <PressableIcon
                                svgName="Trash"
                                onPress={() => {
                                    handleRemoveOption(option)
                                }}
                                containerStyle={style.deleteOptionIcon}
                                disabled={options.length < 3}
                            />
                        </Flex>
                    ))}
                </Flex>
                <Flex row>
                    <Pressable onPress={handleAddOption}>
                        <Flex
                            row
                            align="center"
                            gap="sm"
                            style={style.addOptionButton}>
                            <Text>{t('words.add')}</Text>
                            <SvgImage name="PlusCircle" />
                        </Flex>
                    </Pressable>
                </Flex>
            </Flex>
            <Flex gap="lg">
                <Flex row align="center" justify="between" gap="sm">
                    <Flex row align="center" gap="sm">
                        <SvgImage name="List" />
                        <Text>{t('feature.chat.multiple-choice')}</Text>
                    </Flex>
                    <Switch
                        value={isMultipleChoice}
                        onValueChange={setIsMultipleChoice}
                    />
                </Flex>
                <Flex row align="center" justify="between" gap="sm">
                    <Flex row align="center" gap="sm">
                        <SvgImage name="Bolt" />
                        <Text>{t('feature.chat.show-live-results')}</Text>
                    </Flex>
                    <Switch
                        value={isDisclosed}
                        onValueChange={setIsDisclosed}
                    />
                </Flex>
            </Flex>
            <Button
                title={t('feature.chat.create-poll')}
                onPress={handleCreatePoll}
                disabled={!canSubmit || isLoading}
                containerStyle={style.submitButton}
            />
        </SafeScrollArea>
    )
}

export const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            padding: theme.spacing.lg,
            display: 'flex',
            flexDirection: 'column',
        },
        content: {
            display: 'flex',
            flexDirection: 'column',
            gap: theme.spacing.xl,
        },
        optionsLabel: {
            paddingLeft: theme.spacing.xs,
        },
        deleteOptionIcon: {
            flexShrink: 0,
        },
        addOptionButton: {
            paddingVertical: 4,
            paddingHorizontal: 8,
            backgroundColor: theme.colors.offWhite,
            borderRadius: 24,
        },
        submitButton: {
            marginTop: 'auto',
        },
    })

export default CreatePoll
