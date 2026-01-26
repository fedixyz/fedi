import { Text, useTheme } from '@rneui/themed'
import { Theme } from '@rneui/themed/dist/config'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet } from 'react-native'

import EditNotesOverlay from '../feature/send/EditNotesOverlay'
import { Column, Row } from './Flex'
import SvgImage, { SvgImageSize } from './SvgImage'

type NotesInputProps = {
    notes: string
    setNotes: (notes: string) => void
    label?: string
    onSave?: () => void
    isOptional?: boolean
}

export default function NotesInput({
    notes,
    setNotes,
    onSave,
    label,
    isOptional = true,
}: NotesInputProps) {
    const { theme } = useTheme()

    const style = styles(theme)
    const [isEditing, setIsEditing] = useState(false)

    const { t } = useTranslation()

    const handlePressEdit = useCallback(() => {
        setIsEditing(true)
    }, [])

    return (
        <>
            <Pressable style={style.container} onPress={handlePressEdit}>
                <Column
                    align="stretch"
                    justify="center"
                    gap="xs"
                    fullWidth
                    style={style.content}>
                    <Row grow align="center" justify="between">
                        <Text small bold color={theme.colors.night}>
                            {label ?? t('words.notes')}
                        </Text>
                        <Row align="center" gap="xs">
                            <SvgImage name="EditPaper" size={SvgImageSize.sm} />
                            <Text small>
                                {notes ? t('words.edit') : t('words.add')}
                            </Text>
                        </Row>
                    </Row>
                    {notes && (
                        <Text
                            small
                            color={theme.colors.darkGrey}
                            numberOfLines={3}>
                            {notes}
                        </Text>
                    )}
                </Column>
            </Pressable>
            <EditNotesOverlay
                show={isEditing}
                notes={notes}
                setNotes={setNotes}
                isOptional={isOptional}
                dismiss={() => {
                    onSave && onSave()
                    setIsEditing(false)
                }}
            />
        </>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center',
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.md,
            borderWidth: 1,
            borderRadius: theme.borders.defaultRadius,
            borderColor: theme.colors.lightGrey,
            alignSelf: 'stretch',
        },
        content: {
            paddingHorizontal: theme.spacing.xs,
        },
        rightContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.xs,
        },
    })
