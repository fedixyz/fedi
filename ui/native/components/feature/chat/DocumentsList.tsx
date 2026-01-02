import { DocumentPickerResponse } from '@react-native-documents/picker'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useMemo } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'

import { formatFileSize } from '@fedi/common/utils/media'
import { upsertListItem } from '@fedi/common/utils/redux'

import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

type DocumentItem = {
    id: string
    document: DocumentPickerResponse
    isLoading: boolean
}

type Props = {
    documents: DocumentPickerResponse[]
    pendingDocuments: DocumentPickerResponse[]
    onRemove: (uri: string) => void
}

/**
 * Displays a list of document attachments with loading states and remove buttons.
 * Used in MessageInput to show selected documents before sending.
 */
export const DocumentsList: React.FC<Props> = ({
    documents,
    pendingDocuments,
    onRemove,
}) => {
    const { theme } = useTheme()
    const style = styles(theme)

    const items = useMemo(() => {
        let list: DocumentItem[] = documents.map(doc => ({
            document: doc,
            isLoading: false,
            id: doc.uri,
        }))

        for (const doc of pendingDocuments) {
            list = upsertListItem(list, {
                document: doc,
                isLoading: true,
                id: doc.uri,
            })
        }

        // Sort by fileName to prevent layout shifting
        return list.sort((a, b) =>
            (a.document.name ?? '').localeCompare(b.document.name ?? ''),
        )
    }, [documents, pendingDocuments])

    return (
        <View style={style.container}>
            {items.map(({ document, isLoading, id }) => (
                <View key={`doc-${id}`} style={style.attachment}>
                    <View style={style.attachmentIcon}>
                        {isLoading ? (
                            <ActivityIndicator />
                        ) : (
                            <SvgImage name="File" />
                        )}
                    </View>
                    <View style={style.attachmentContent}>
                        <Text>{document.name}</Text>
                        <Text style={style.attachmentSize}>
                            {formatFileSize(document.size ?? 0)}
                        </Text>
                    </View>
                    {!isLoading && (
                        <Pressable
                            style={style.removeButton}
                            onPress={() => onRemove(document.uri)}>
                            <SvgImage
                                name="Close"
                                size={SvgImageSize.xs}
                                color={theme.colors.white}
                            />
                        </Pressable>
                    )}
                </View>
            ))}
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flexDirection: 'column',
            gap: theme.spacing.sm,
        },
        attachment: {
            padding: theme.spacing.sm,
            borderRadius: 8,
            backgroundColor: theme.colors.offWhite,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
        },
        attachmentIcon: {
            width: 48,
            height: 48,
            padding: theme.spacing.md,
            backgroundColor: theme.colors.extraLightGrey,
            borderRadius: 8,
        },
        attachmentContent: {
            flex: 1,
            flexDirection: 'column',
            display: 'flex',
            gap: theme.spacing.xs,
        },
        attachmentSize: {
            color: theme.colors.darkGrey,
        },
        removeButton: {
            justifyContent: 'center',
            alignItems: 'center',
            position: 'absolute',
            top: 8,
            right: 8,
            width: 16,
            height: 16,
            borderRadius: 16,
            backgroundColor: theme.colors.night,
        },
    })
