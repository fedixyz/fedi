import { Text, Theme, useTheme, Input } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { Row } from '../../ui/Flex'
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
                    <Row center style={style.headerContainer}>
                        <PressableIcon
                            svgName="Close"
                            onPress={() => dismiss()}
                            svgProps={{ size: SvgImageSize.md }}
                            containerStyle={style.backIconContainer}
                        />
                        <Text bold style={style.title}>
                            {t('phrases.add-notes')}
                        </Text>
                    </Row>
                ),
                body: (
                    <Input
                        value={notes}
                        onChangeText={setNotes}
                        numberOfLines={5}
                        maxLength={144}
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
                        containerStyle={style.inputContainer}
                        inputContainerStyle={style.innerInputContainer}
                        inputStyle={style.inputStyle}
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
        inputContainer: {
            height: 160,
        },
        label: {
            padding: theme.spacing.sm,
            height: 30,
        },
        innerInputContainer: {
            borderColor: theme.colors.lightGrey,
            padding: theme.spacing.sm,
            borderWidth: 1.5,
            borderRadius: 8,
            height: 130,
        },
        inputStyle: {
            textAlignVertical: 'top',
            height: 130,
            fontSize: 14, // caption
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
