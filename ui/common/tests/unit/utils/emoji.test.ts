import {
    MATRIX_REACTION_PICKER_ADDITIONAL_EMOJIS,
    MATRIX_REACTION_PICKER_SECTIONS,
    searchMatrixReactionPickerEmojis,
} from '../../../utils/emoji'

describe('matrix reaction emoji picker helpers', () => {
    it('excludes fixed quick reactions from the default picker list', () => {
        expect(
            MATRIX_REACTION_PICKER_ADDITIONAL_EMOJIS.find(
                emoji => emoji.emoji === '👍',
            ),
        ).toBeUndefined()
    })

    it('searches emoji data outside the fixed quick set', () => {
        expect(searchMatrixReactionPickerEmojis('sparkles')[0].emoji).toBe('✨')
    })

    it('exposes browsable emoji sections without the previous initial cap', () => {
        expect(
            MATRIX_REACTION_PICKER_SECTIONS.map(section => section.id),
        ).toEqual([
            'frequent',
            'people',
            'nature',
            'foods',
            'activity',
            'places',
            'objects',
            'symbols',
            'flags',
        ])
        expect(
            MATRIX_REACTION_PICKER_SECTIONS.map(section => section.title),
        ).toEqual([
            'Frequently used',
            'Smileys & People',
            'Animals & Nature',
            'Food & Drink',
            'Activities',
            'Travel & Places',
            'Objects',
            'Symbols',
            'Flags',
        ])
        expect(
            MATRIX_REACTION_PICKER_SECTIONS.flatMap(
                section => section.emojis,
            ).some(emoji => emoji.emoji === '🏳️‍🌈'),
        ).toBe(true)
    })
})
