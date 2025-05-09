import { Text, useTheme } from '@rneui/themed'
import { Theme } from '@rneui/themed/dist/config'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'

import EditNotesOverlay from '../feature/send/EditNotesOverlay'
import SvgImage, { SvgImageSize } from './SvgImage'

type NotesInputProps = {
    notes: string
    setNotes: (notes: string) => void
    label?: string
    onSave?: () => void
}

export default function NotesInput({
    notes,
    setNotes,
    onSave,
    label,
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
                <View style={style.content}>
                    <View style={style.titleRow}>
                        <Text small bold color={theme.colors.night}>
                            {label ?? t('words.notes')}
                        </Text>
                        <View style={style.rightContainer}>
                            <SvgImage name="EditPaper" size={SvgImageSize.sm} />
                            <Text small>
                                {notes ? t('words.edit') : t('words.add')}
                            </Text>
                        </View>
                    </View>
                    {notes && (
                        <Text small color={theme.colors.darkGrey}>
                            {notes}
                        </Text>
                    )}
                </View>
            </Pressable>
            <EditNotesOverlay
                show={isEditing}
                notes={notes}
                setNotes={setNotes}
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
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'stretch',
            width: '100%',
            paddingHorizontal: theme.spacing.xs,
            gap: theme.spacing.xs,
        },
        titleRow: {
            display: 'flex',
            flexDirection: 'row',
            flexGrow: 1,
            justifyContent: 'space-between',
            alignItems: 'center',
        },
        rightContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.xs,
        },
    })
