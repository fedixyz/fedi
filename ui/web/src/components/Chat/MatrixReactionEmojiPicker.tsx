import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { MatrixEvent } from '@fedi/common/types'
import {
    MATRIX_REACTION_PICKER_SECTIONS,
    MatrixReactionPickerEmoji,
    searchMatrixReactionPickerEmojis,
} from '@fedi/common/utils/emoji'
import { canAddMatrixReaction } from '@fedi/common/utils/matrix'

import { styled, theme } from '../../styles'
import { CircularLoader } from '../CircularLoader'
import { Text } from '../Text'

type Props = {
    event: MatrixEvent
    pendingReaction?: string | null
    onSelect(reactionKey: string): void
}

type EmojiSectionSource = {
    id: string
    title: string
    emojis: MatrixReactionPickerEmoji[]
}

export const MatrixReactionEmojiPicker: React.FC<Props> = ({
    event,
    pendingReaction,
    onSelect,
}) => {
    const { t } = useTranslation()
    const [query, setQuery] = useState('')
    const sections = useMemo<EmojiSectionSource[]>(() => {
        const normalizedQuery = query.trim()
        if (normalizedQuery) {
            return [
                {
                    id: 'search',
                    title: t('feature.chat.reaction-search-results'),
                    emojis: searchMatrixReactionPickerEmojis(normalizedQuery),
                },
            ]
        }

        return MATRIX_REACTION_PICKER_SECTIONS.map(section => ({
            ...section,
            title: t(section.titleI18nKey),
        }))
    }, [query, t])

    const renderEmoji = (emoji: MatrixReactionPickerEmoji) => {
        const isPending = pendingReaction === emoji.emoji
        const disabled =
            !!pendingReaction || !canAddMatrixReaction(event, emoji.emoji)

        return (
            <EmojiButton
                key={emoji.id}
                aria-label={`react with ${emoji.emoji}`}
                disabled={disabled}
                type="button"
                onClick={() => onSelect(emoji.emoji)}>
                {isPending ? (
                    <CircularLoader size="xs" />
                ) : (
                    <EmojiText>{emoji.emoji}</EmojiText>
                )}
            </EmojiButton>
        )
    }

    return (
        <Container aria-label="emoji picker">
            <SearchInput
                aria-label="search emoji"
                autoCapitalize="none"
                autoCorrect="off"
                onChange={ev => setQuery(ev.target.value)}
                placeholder={t('words.search')}
                value={query}
            />
            <SectionList>
                {sections.map(section => (
                    <Section key={section.id}>
                        <SectionTitle variant="small" weight="bold">
                            {section.title}
                        </SectionTitle>
                        <EmojiGrid>{section.emojis.map(renderEmoji)}</EmojiGrid>
                    </Section>
                ))}
            </SectionList>
        </Container>
    )
}

const Container = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    maxHeight: 360,
    padding: '8px 4px 12px',
})

const SearchInput = styled('input', {
    appearance: 'none',
    background: theme.colors.extraLightGrey,
    border: 0,
    borderRadius: 18,
    color: theme.colors.primary,
    fontSize: 14,
    height: 36,
    outline: 'none',
    padding: '0 16px',
})

const SectionList = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    overflowY: 'auto',
})

const Section = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
})

const SectionTitle = styled(Text, {
    color: theme.colors.darkGrey,
    paddingLeft: 4,
})

const EmojiGrid = styled('div', {
    display: 'grid',
    gridTemplateColumns: 'repeat(8, minmax(0, 1fr))',
    gap: 2,
})

const EmojiButton = styled('button', {
    appearance: 'none',
    alignItems: 'center',
    background: 'transparent',
    border: 0,
    borderRadius: 16,
    cursor: 'pointer',
    display: 'flex',
    height: 36,
    justifyContent: 'center',
    padding: 0,

    '&:hover, &:focus-visible': {
        background: theme.colors.primary05,
        outline: 'none',
    },

    '&:disabled': {
        cursor: 'not-allowed',
        opacity: 0.4,
    },
})

const EmojiText = styled('span', {
    fontSize: 24,
    lineHeight: '32px',
})
