import { Text, Theme, useTheme } from '@rneui/themed'
import type { ResourceKey } from 'i18next'
import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    StyleSheet,
    TextInput,
    View,
} from 'react-native'

import { MatrixEvent } from '@fedi/common/types'
import {
    MatrixReactionPickerEmoji,
    MATRIX_REACTION_PICKER_SECTIONS,
    searchMatrixReactionPickerEmojis,
} from '@fedi/common/utils/emoji'
import { canAddMatrixReaction } from '@fedi/common/utils/matrix'

type Props = {
    event: MatrixEvent
    pendingReaction?: string | null
    onSelect: (reactionKey: string) => void
}

type EmojiRow = MatrixReactionPickerEmoji[]
type EmojiListItem =
    | {
          type: 'header'
          id: string
          title: string
      }
    | {
          type: 'row'
          id: string
          emojis: EmojiRow
      }

type EmojiSectionSource = {
    id: string
    title: string
    titleI18nKey: ResourceKey
    emojis: MatrixReactionPickerEmoji[]
}

const EMOJIS_PER_ROW = 8

const makeEmojiRows = (emojis: MatrixReactionPickerEmoji[]): EmojiRow[] => {
    const rows: EmojiRow[] = []

    for (let i = 0; i < emojis.length; i += EMOJIS_PER_ROW) {
        rows.push(emojis.slice(i, i + EMOJIS_PER_ROW))
    }

    return rows
}

export const MatrixReactionEmojiPicker: React.FC<Props> = ({
    event,
    pendingReaction,
    onSelect,
}) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const style = styles(theme)
    const [query, setQuery] = useState('')
    const listItems = useMemo<EmojiListItem[]>(() => {
        const normalizedQuery = query.trim()
        const sections: EmojiSectionSource[] = normalizedQuery
            ? [
                  {
                      id: 'search',
                      title: t(
                          'feature.chat.reaction-search-results' as ResourceKey,
                      ),
                      titleI18nKey:
                          'feature.chat.reaction-search-results' as ResourceKey,
                      emojis: searchMatrixReactionPickerEmojis(normalizedQuery),
                  },
              ]
            : MATRIX_REACTION_PICKER_SECTIONS.map(section => ({
                  ...section,
                  title: t(section.titleI18nKey as ResourceKey),
              }))

        return sections.flatMap(section => [
            {
                type: 'header' as const,
                id: section.id,
                title: section.title,
            },
            ...makeEmojiRows(section.emojis).map((row, index) => ({
                type: 'row' as const,
                id: `${section.id}-${index}`,
                emojis: row,
            })),
        ])
    }, [query, t])

    const renderEmojiButton = (emoji: MatrixReactionPickerEmoji) => {
        const isPending = pendingReaction === emoji.emoji
        const disabled =
            !!pendingReaction || !canAddMatrixReaction(event, emoji.emoji)

        return (
            <Pressable
                key={emoji.id}
                accessibilityRole="button"
                accessibilityLabel={`react with ${emoji.emoji}`}
                disabled={disabled}
                onPress={() => onSelect(emoji.emoji)}
                style={[style.emojiButton, disabled && style.disabled]}>
                {isPending ? (
                    <ActivityIndicator size="small" />
                ) : (
                    <Text style={style.emoji}>{emoji.emoji}</Text>
                )}
            </Pressable>
        )
    }

    return (
        <View accessibilityLabel="emoji picker" style={style.container}>
            <TextInput
                accessibilityLabel="search emoji"
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setQuery}
                placeholder={t('words.search')}
                style={style.search}
                value={query}
            />
            <FlatList
                keyboardShouldPersistTaps="handled"
                data={listItems}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                    <>
                        {item.type === 'header' ? (
                            <Text style={style.sectionTitle}>{item.title}</Text>
                        ) : (
                            <View style={style.grid}>
                                {item.emojis.map(renderEmojiButton)}
                            </View>
                        )}
                    </>
                )}
            />
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            maxHeight: 360,
            paddingHorizontal: theme.spacing.sm,
            paddingBottom: theme.spacing.md,
        },
        search: {
            backgroundColor: theme.colors.extraLightGrey,
            borderRadius: 18,
            color: theme.colors.primary,
            fontSize: 14,
            height: 36,
            marginBottom: theme.spacing.md,
            paddingHorizontal: theme.spacing.md,
        },
        sectionTitle: {
            backgroundColor: theme.colors.white,
            color: theme.colors.darkGrey,
            fontSize: 13,
            fontWeight: '600',
            paddingBottom: theme.spacing.xs,
            paddingTop: theme.spacing.sm,
        },
        grid: {
            flexDirection: 'row',
            paddingBottom: theme.spacing.xs,
        },
        emojiButton: {
            alignItems: 'center',
            borderRadius: 16,
            height: 36,
            justifyContent: 'center',
            width: `${100 / EMOJIS_PER_ROW}%`,
        },
        disabled: {
            opacity: 0.4,
        },
        emoji: {
            fontSize: 24,
            lineHeight: 32,
        },
    })
