import { Text, Theme, useTheme, Input } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import Flex from '../../ui/Flex'
import FullModalOverlay from '../../ui/FullModalOverlay'
import { PressableIcon } from '../../ui/PressableIcon'
import { SvgImageSize } from '../../ui/SvgImage'

type EditNotesOverlayProps = {
    show: boolean
    dismiss: () => void
    setNotes: (notes: string) => void
    notes: string
    isOptional?: boolean
}

const EditNotesOverlay = ({
    show,
    dismiss,
    setNotes,
    notes,
    isOptional = true,
}: EditNotesOverlayProps) => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    const style = styles(theme)

    return (
        <FullModalOverlay
            contents={{
                headerElement: (
                    <>
                        <Flex row center style={style.headerContainer}>
                            <PressableIcon
                                svgName="Close"
                                onPress={() => dismiss()}
                                svgProps={{ size: SvgImageSize.md }}
                                containerStyle={style.backIconContainer}
                            />
                            <Text bold style={style.title}>
                                {t('phrases.add-notes')}
                            </Text>
                        </Flex>
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
                                {t(
                                    isOptional
                                        ? 'feature.send.edit-notes-label'
                                        : 'feature.send.edit-notes-label-required',
                                )}
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
            paddingVertical: theme.spacing.md,
        },
        title: {
            textAlign: 'center',
        },
    })

export default EditNotesOverlay
