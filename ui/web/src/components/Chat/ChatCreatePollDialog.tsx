import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
    POLL_DEFAULT_OPTIONS,
    POLL_MAX_OPTIONS,
    POLL_MIN_OPTIONS,
} from '@fedi/common/constants/matrix'
import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'

import { styled, theme } from '../../styles'
import { Button } from '../Button'
import { Dialog } from '../Dialog'
import { Column, Row } from '../Flex'
import { Icon } from '../Icon'
import { IconButton } from '../IconButton'
import { Input } from '../Input'
import { Switch } from '../Switch'
import { Text } from '../Text'

type PollOption = {
    id: number
    text: string
}

type Props = {
    roomId: string
    open: boolean
    onOpenChange(open: boolean): void
}

function makeInitialOptions(): PollOption[] {
    return Array.from({ length: POLL_DEFAULT_OPTIONS }, (_, id) => ({
        id,
        text: '',
    }))
}

export const ChatCreatePollDialog: React.FC<Props> = ({
    roomId,
    open,
    onOpenChange,
}) => {
    const { t } = useTranslation()
    const fedimint = useFedimint()
    const toast = useToast()
    const [question, setQuestion] = useState('')
    const [options, setOptions] = useState<PollOption[]>(makeInitialOptions)
    const [isMultipleChoice, setIsMultipleChoice] = useState(false)
    const [isDisclosed, setIsDisclosed] = useState(true)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const resetState = useCallback(() => {
        setQuestion('')
        setOptions(makeInitialOptions())
        setIsMultipleChoice(false)
        setIsDisclosed(true)
        setIsSubmitting(false)
    }, [])

    useEffect(() => {
        if (!open) resetState()
    }, [open, resetState])

    const canSubmit =
        question.trim().length > 0 &&
        options.length >= POLL_MIN_OPTIONS &&
        options.every(option => option.text.trim().length > 0)

    const handleAddOption = useCallback(() => {
        setOptions(prev => {
            if (prev.length >= POLL_MAX_OPTIONS) return prev
            return [
                ...prev,
                {
                    id: Math.max(...prev.map(option => option.id)) + 1,
                    text: '',
                },
            ]
        })
    }, [])

    const handleRemoveOption = useCallback((id: number) => {
        setOptions(prev => {
            if (prev.length <= POLL_MIN_OPTIONS) return prev
            return prev.filter(option => option.id !== id)
        })
    }, [])

    const handleOptionChange = useCallback((id: number, text: string) => {
        setOptions(prev =>
            prev.map(option =>
                option.id === id ? { ...option, text } : option,
            ),
        )
    }, [])

    const handleSubmit = useCallback(async () => {
        if (!canSubmit) return

        setIsSubmitting(true)
        try {
            await fedimint.matrixStartPoll(
                roomId,
                question.trim(),
                options.map(option => option.text.trim()),
                isMultipleChoice,
                isDisclosed,
            )
            onOpenChange(false)
        } catch (err) {
            toast.error(t, err, 'errors.unknown-error')
        } finally {
            setIsSubmitting(false)
        }
    }, [
        canSubmit,
        fedimint,
        isDisclosed,
        isMultipleChoice,
        onOpenChange,
        options,
        question,
        roomId,
        t,
        toast,
    ])

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            title={t('feature.chat.create-a-poll')}>
            <Column gap="lg">
                <Input
                    label={t('words.question')}
                    value={question}
                    onChange={ev => setQuestion(ev.currentTarget.value)}
                />
                <Column gap="sm">
                    <Text variant="small">{t('words.options')}</Text>
                    {options.map((option, index) => (
                        <Row key={option.id} align="center" gap="sm">
                            <Input
                                value={option.text}
                                aria-label={`option-input-${index + 1}`}
                                onChange={ev =>
                                    handleOptionChange(
                                        option.id,
                                        ev.currentTarget.value,
                                    )
                                }
                            />
                            <IconButton
                                icon="Trash"
                                aria-label={`remove-option-${index + 1}`}
                                disabled={options.length <= POLL_MIN_OPTIONS}
                                onClick={() => handleRemoveOption(option.id)}
                            />
                        </Row>
                    ))}
                    <AddOptionButton
                        type="button"
                        disabled={options.length >= POLL_MAX_OPTIONS}
                        onClick={handleAddOption}>
                        <Text>{t('words.add')}</Text>
                        <Icon icon="PlusCircle" />
                    </AddOptionButton>
                </Column>
                <Column gap="lg">
                    <Row align="center" gap="sm" justify="between">
                        <Row align="center" gap="sm">
                            <Icon icon="List" />
                            <Text>{t('feature.chat.multiple-choice')}</Text>
                        </Row>
                        <Switch
                            checked={isMultipleChoice}
                            onCheckedChange={setIsMultipleChoice}
                        />
                    </Row>
                    <Row align="center" gap="sm" justify="between">
                        <Row align="center" gap="sm">
                            <Icon icon="Bolt" />
                            <Text>{t('feature.chat.show-live-results')}</Text>
                        </Row>
                        <Switch
                            checked={isDisclosed}
                            onCheckedChange={setIsDisclosed}
                        />
                    </Row>
                </Column>
                <Button
                    width="full"
                    loading={isSubmitting}
                    disabled={!canSubmit || isSubmitting}
                    onClick={handleSubmit}>
                    {t('feature.chat.create-poll')}
                </Button>
            </Column>
        </Dialog>
    )
}

const AddOptionButton = styled('button', {
    alignItems: 'center',
    alignSelf: 'flex-start',
    background: theme.colors.offWhite,
    borderRadius: 24,
    cursor: 'pointer',
    display: 'flex',
    gap: theme.spacing.sm,
    padding: '4px 8px',

    '&:disabled': {
        cursor: 'not-allowed',
        opacity: 0.5,
    },
})
