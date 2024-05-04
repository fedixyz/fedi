import { Input, Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Keyboard,
    Pressable,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native'

import { hexToRgba } from '@fedi/common/utils/color'

import { HistoryDetailItem, HistoryDetailItemProps } from './HistoryDetailItem'
import SvgImage, { SvgImageSize } from './SvgImage'

export interface HistoryDetailProps {
    icon: React.ReactNode
    title: React.ReactNode
    amount: string
    items: HistoryDetailItemProps[]
    notes?: string
    onSaveNotes?: (notes: string) => void
    onClose: () => void
}

export const HistoryDetail: React.FC<HistoryDetailProps> = ({
    icon,
    title,
    amount,
    items,
    notes: propsNotes,
    onSaveNotes,
    onClose,
}) => {
    const inputRef = useRef<TextInput | null>(null)
    const { theme } = useTheme()
    const { t } = useTranslation()
    const [notes, setNotes] = useState(propsNotes || '')
    const [isFocused, setIsFocused] = useState(false)

    // If notes prop changes, update notes state
    useEffect(() => {
        if (propsNotes !== undefined) {
            setNotes(propsNotes)
        }
    }, [propsNotes])

    const handleNotesInputChanged = (input: string) => {
        setNotes(input)
    }

    const handleSaveNotes = () => {
        if (onSaveNotes && notes !== propsNotes) {
            onSaveNotes(notes)
        }
    }

    const handleClose = () => {
        handleSaveNotes()
        onClose()
    }

    const style = styles(theme)

    return (
        <Pressable style={style.container} onPress={Keyboard.dismiss}>
            <TouchableOpacity
                style={style.closeIconContainer}
                onPress={handleClose}>
                <SvgImage name="Close" size={SvgImageSize.md} />
            </TouchableOpacity>
            {icon}
            <Text style={style.detailTitle}>{title}</Text>
            {amount && (
                <Text h2 medium>
                    {amount}
                </Text>
            )}
            <View style={style.detailItemsContainer}>
                {items.map((item, idx) => (
                    <HistoryDetailItem
                        key={idx}
                        {...item}
                        // Hide the border on the last item, if we're not
                        // rendering the notes field as the last item.
                        noBorder={!onSaveNotes && idx === items.length - 1}
                    />
                ))}
                {onSaveNotes && (
                    <HistoryDetailItem
                        label={`${t('phrases.add-note')} +`}
                        value={
                            <Input
                                ref={(ref: unknown) => {
                                    inputRef.current = ref as TextInput
                                }}
                                onChangeText={handleNotesInputChanged}
                                onFocus={() => setIsFocused(true)}
                                onBlur={() => {
                                    setIsFocused(false)
                                    handleSaveNotes()
                                }}
                                value={notes}
                                placeholder={t('words.optional')}
                                returnKeyType="done"
                                containerStyle={style.inputOuterContainer}
                                inputContainerStyle={[
                                    style.inputInnerContainer,
                                    isFocused
                                        ? style.focusedInputInnerContainer
                                        : {},
                                ]}
                                onSubmitEditing={() => {
                                    handleSaveNotes()
                                }}
                                inputStyle={style.input}
                                placeholderTextColor={hexToRgba(
                                    theme.colors.night,
                                    0.2,
                                )}
                                blurOnSubmit
                                multiline
                            />
                        }
                        onPress={() => {
                            if (!inputRef.current) return
                            const current: TextInput = inputRef.current
                            current.focus()
                        }}
                        noBorder
                    />
                )}
            </View>
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            alignItems: 'center',
            width: '100%',
        },
        closeIconContainer: {
            alignSelf: 'flex-end',
        },
        detailItemsContainer: {
            marginTop: theme.spacing.xl,
            gap: theme.spacing.xs,
            width: '100%',
        },
        detailTitle: {
            marginTop: theme.spacing.sm,
            marginBottom: theme.spacing.xxs,
        },
        inputOuterContainer: {
            flex: 1,
            height: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            paddingRight: 0,
            minHeight: 0,
        },
        inputInnerContainer: {
            borderBottomColor: 'transparent',
            width: '100%',
            height: 'auto',
            minHeight: 0,
        },
        focusedInputInnerContainer: {
            borderBottomColor: theme.colors.primary,
        },
        input: {
            fontSize: 14,
            textAlign: 'right',
            minHeight: 0,
            paddingTop: 0,
        },
    })
