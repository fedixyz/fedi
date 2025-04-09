import { Text, Theme, useTheme, Input } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import FullModalOverlay from '../../ui/FullModalOverlay'
import { PressableIcon } from '../../ui/PressableIcon'
import { SvgImageSize } from '../../ui/SvgImage'

type EditNotesOverlayProps = {
    show: boolean
    dismiss: () => void
    setNotes: (notes: string) => void
    notes: string
}

const EditNotesOverlay = ({
    show,
    dismiss,
    setNotes,
    notes,
}: EditNotesOverlayProps) => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    const style = styles(theme)

    return (
        <FullModalOverlay
            contents={{
                headerElement: (
                    <>
                        <View style={style.headerContainer}>
                            <PressableIcon
                                svgName="Close"
                                onPress={() => dismiss()}
                                svgProps={{ size: SvgImageSize.md }}
                                containerStyle={style.backIconContainer}
                            />
                            <Text bold style={style.title}>
                                {t('phrases.add-notes')}
                            </Text>
                        </View>
                    </>
                ),
                body: (
                    <Input
                        value={notes}
                        onChangeText={setNotes}
                        numberOfLines={5}
                        multiline
                        textAlignVertical="top"
                        placeholder={t('feature.send.edit-notes-placeholder')}
                        label={
                            <Text small style={style.label}>
                                {t('feature.send.edit-notes-label')}
                            </Text>
                        }
                        inputStyle={style.inputStyle}
                        inputContainerStyle={style.innerInputContainer}
                        containerStyle={style.inputContainer}
                        returnKeyType="done"
                    />
                ),
                buttons: [
                    {
                        primary: true,
                        text: t('words.save'),
                        onPress: () => dismiss(),
                    },
                ],
            }}
            show={show}
            onBackdropPress={() => dismiss()}
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        backIconContainer: {
            position: 'absolute',
            left: theme.spacing.sm,
        },
        label: { paddingHorizontal: theme.spacing.sm },
        inputStyle: {
            textAlignVertical: 'top',
            minHeight: 120,
            fontSize: 14, // caption
        },
        inputContainer: {
            paddingTop: theme.spacing.lg,
        },
        innerInputContainer: {
            marginTop: theme.spacing.sm,
            borderColor: theme.colors.lightGrey,
            padding: theme.spacing.sm,
            borderWidth: 1.5,
            borderRadius: 8,
            maxHeight: 120,
        },
        headerContainer: {
            alignSelf: 'stretch',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: theme.spacing.md,
        },
        title: {
            textAlign: 'center',
        },
    })

export default EditNotesOverlay
