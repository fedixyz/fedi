import type { ResourceKey } from 'i18next'

import { MATRIX_QUICK_REACTION_EMOJIS } from '../constants/matrix'
import emojiMartData from '../data/emoji-mart-native.json'

type EmojiMartData = {
    categories: EmojiCategory[]
    emojis: Record<string, Emoji>
}

type EmojiCategory = {
    id: string
    emojis: string[]
}

type Emoji = {
    id: string
    name: string
    keywords: string[]
    skins: {
        native: string
    }[]
}

export type MatrixReactionPickerEmoji = {
    emoji: string
    id: string
    name: string
    keywords: string[]
}

export type MatrixReactionPickerSection = {
    id: string
    title: string
    titleI18nKey: ResourceKey
    emojis: MatrixReactionPickerEmoji[]
}

const emojiData = emojiMartData as EmojiMartData
const quickReactionEmojiSet = new Set<string>(MATRIX_QUICK_REACTION_EMOJIS)
const CATEGORY_TITLES_BY_ID: Record<string, string> = {
    people: 'Smileys & People',
    nature: 'Animals & Nature',
    foods: 'Food & Drink',
    activity: 'Activities',
    places: 'Travel & Places',
    objects: 'Objects',
    symbols: 'Symbols',
    flags: 'Flags',
}
const CATEGORY_TITLE_KEYS_BY_ID: Record<string, ResourceKey> = {
    people: 'feature.chat.reaction-category-people',
    nature: 'feature.chat.reaction-category-nature',
    foods: 'feature.chat.reaction-category-foods',
    activity: 'feature.chat.reaction-category-activity',
    places: 'feature.chat.reaction-category-places',
    objects: 'feature.chat.reaction-category-objects',
    symbols: 'feature.chat.reaction-category-symbols',
    flags: 'feature.chat.reaction-category-flags',
}

const makePickerEmoji = (emoji?: Emoji): MatrixReactionPickerEmoji | null => {
    const native = emoji?.skins?.[0]?.native
    if (!native) return null

    return {
        emoji: native,
        id: emoji.id,
        name: emoji.name,
        keywords: emoji.keywords,
    }
}

export const MATRIX_REACTION_PICKER_SECTIONS: MatrixReactionPickerSection[] = [
    {
        id: 'frequent',
        title: 'Frequently used',
        titleI18nKey: 'feature.chat.reaction-category-frequent',
        emojis: MATRIX_QUICK_REACTION_EMOJIS.map(quickEmoji => {
            const sourceEmoji = Object.values(emojiData.emojis).find(
                emoji => emoji.skins?.[0]?.native === quickEmoji,
            )
            const pickerEmoji = sourceEmoji && makePickerEmoji(sourceEmoji)

            return (
                pickerEmoji || {
                    emoji: quickEmoji,
                    id: quickEmoji,
                    name: quickEmoji,
                    keywords: [],
                }
            )
        }),
    },
    ...emojiData.categories.map(category => ({
        id: category.id,
        title:
            CATEGORY_TITLES_BY_ID[category.id] ||
            category.id.replace(/^\w/, first => first.toUpperCase()),
        titleI18nKey:
            CATEGORY_TITLE_KEYS_BY_ID[category.id] ||
            (`feature.chat.reaction-category-${category.id}` as ResourceKey),
        emojis: category.emojis
            .map(id => makePickerEmoji(emojiData.emojis[id]))
            .filter((emoji): emoji is MatrixReactionPickerEmoji => !!emoji)
            .filter(emoji => !quickReactionEmojiSet.has(emoji.emoji)),
    })),
].filter(section => section.emojis.length > 0)

export const MATRIX_REACTION_PICKER_EMOJIS: MatrixReactionPickerEmoji[] =
    MATRIX_REACTION_PICKER_SECTIONS.flatMap(section => section.emojis)

export const MATRIX_REACTION_PICKER_ADDITIONAL_EMOJIS =
    MATRIX_REACTION_PICKER_EMOJIS.filter(
        emoji => !quickReactionEmojiSet.has(emoji.emoji),
    )

export const searchMatrixReactionPickerEmojis = (
    query: string,
): MatrixReactionPickerEmoji[] => {
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) return MATRIX_REACTION_PICKER_ADDITIONAL_EMOJIS

    return MATRIX_REACTION_PICKER_EMOJIS.filter(emoji => {
        if (emoji.emoji === normalizedQuery) return true
        if (emoji.id.includes(normalizedQuery)) return true
        if (emoji.name.toLowerCase().includes(normalizedQuery)) return true

        return emoji.keywords.some(keyword =>
            keyword.toLowerCase().includes(normalizedQuery),
        )
    })
}
