import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Switch, Text, Theme, useTheme } from '@rneui/themed'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'

import { fedimint } from '../bridge'
import { FieldInput } from '../components/ui/FieldInput'
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
            <View style={style.options}>
                <Text small style={style.optionsLabel}>
                    {t('words.options')}
                </Text>
                <View style={style.optionsContainer}>
                    {options.map(option => (
                        <View style={style.option} key={option.id}>
                            <View style={style.optionInput}>
                                <FieldInput
                                    value={option.text}
                                    onChangeText={text =>
                                        handleOptionChange(option, text)
                                    }
                                />
                            </View>
                            <PressableIcon
                                svgName="Trash"
                                onPress={() => {
                                    handleRemoveOption(option)
                                }}
                                containerStyle={style.deleteOptionIcon}
                                disabled={options.length < 3}
                            />
                        </View>
                    ))}
                </View>
                <View style={style.addOptionContainer}>
                    <Pressable onPress={handleAddOption}>
                        <View style={style.addOptionButton}>
                            <Text>{t('words.add')}</Text>
                            <SvgImage name="PlusCircle" />
                        </View>
                    </Pressable>
                </View>
            </View>
            <View style={style.settings}>
                <View style={style.setting}>
                    <View style={style.settingLabel}>
                        <SvgImage name="List" />
                        <Text>{t('feature.chat.multiple-choice')}</Text>
                    </View>
                    <Switch
                        value={isMultipleChoice}
                        onValueChange={setIsMultipleChoice}
                    />
                </View>
                <View style={style.setting}>
                    <View style={style.settingLabel}>
                        <SvgImage name="Bolt" />
                        <Text>{t('feature.chat.show-live-results')}</Text>
                    </View>
                    <Switch
                        value={isDisclosed}
                        onValueChange={setIsDisclosed}
                    />
                </View>
            </View>
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
        options: {
            display: 'flex',
            flexDirection: 'column',
            gap: theme.spacing.sm,
        },
        optionsLabel: {
            paddingLeft: theme.spacing.xs,
        },
        optionsContainer: {
            display: 'flex',
            flexDirection: 'column',
            gap: theme.spacing.sm,
        },
        option: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
        },
        optionInput: {
            flex: 1,
        },
        deleteOptionIcon: {
            flexShrink: 0,
        },
        addOptionContainer: {
            display: 'flex',
            flexDirection: 'row',
        },
        addOptionButton: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            paddingVertical: 4,
            paddingHorizontal: 8,
            backgroundColor: theme.colors.offWhite,
            borderRadius: 24,
        },
        settings: {
            display: 'flex',
            flexDirection: 'column',
            gap: theme.spacing.lg,
        },
        setting: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: theme.spacing.sm,
        },
        settingLabel: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
        },
        endPollPreview: {
            alignItems: 'center',
            gap: theme.spacing.xl,
        },
        pollPreview: {
            backgroundColor: theme.colors.extraLightGrey,
            width: '100%',
            borderRadius: 8,
            padding: theme.spacing.lg,
            alignItems: 'center',
        },
        submitButton: {
            marginTop: 'auto',
        },
        endButton: {
            backgroundColor: theme.colors.red,
        },
    })

export default CreatePoll
