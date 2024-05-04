import React, { useCallback, useState } from 'react'

import { BIP39_WORD_LIST } from '@fedi/common/constants/bip39'
import { SeedWords } from '@fedi/common/types'

import { styled, theme } from '../styles'

interface Props {
    words: SeedWords
    readOnly?: boolean
    onChangeWords?: (words: SeedWords) => void
}

const blankSeedWords: SeedWords = Array(12).fill('')

export const RecoverySeedWords: React.FC<Props> = ({
    words,
    onChangeWords,
    readOnly,
}) => {
    const [errors, setErrors] = useState(Array(12).fill(false))

    const handleChangeWord = useCallback(
        (word: string, idx: number) => {
            if (!onChangeWords) return
            onChangeWords(
                blankSeedWords.map((_, wordIdx) => {
                    if (wordIdx === idx) return word
                    return words[wordIdx] || ''
                }),
            )
        },
        [words, onChangeWords],
    )

    const handleFocusWord = useCallback((idx: number) => {
        setErrors(errs => {
            const newErrs = [...errs]
            newErrs[idx] = false
            return newErrs
        })
    }, [])

    const handleBlurWord = useCallback(
        (idx: number) => {
            const word = words[idx]
            const hasError = word && !BIP39_WORD_LIST.includes(word)
            setErrors(errs => {
                const newErrs = [...errs]
                newErrs[idx] = hasError
                return newErrs
            })
        },
        [words],
    )

    return (
        <Container>
            <Inner>
                {blankSeedWords.map((_, idx) => (
                    <Word
                        key={idx}
                        style={{
                            gridColumn: idx < 6 ? 1 : 2,
                            gridRow: (idx % 6) + 1,
                        }}>
                        <WordNumber error={!!errors[idx]}>{idx + 1}</WordNumber>
                        <WordInput
                            value={words[idx] || ''}
                            readOnly={readOnly}
                            error={readOnly ? false : !!errors[idx]}
                            onChange={ev =>
                                handleChangeWord(ev.currentTarget.value, idx)
                            }
                            onFocus={() => handleFocusWord(idx)}
                            onBlur={() => handleBlurWord(idx)}
                        />
                    </Word>
                ))}
            </Inner>
        </Container>
    )
}

const Container = styled('div', {
    holoGradient: '900',
    padding: 2,
    borderRadius: 20,
})

const Inner = styled('div', {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gridGap: '16px',
    padding: '24px 30px 30px 20px',
    borderRadius: 18,
    background: theme.colors.white,
})

const Word = styled('div', {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    minWidth: 0,
})

const WordNumber = styled('div', {
    flexShrink: 0,
    width: 20,
    textAlign: 'right',

    variants: {
        error: {
            true: {
                color: theme.colors.red,
            },
        },
    },
})

const WordInput = styled('input', {
    flexShrink: 1,
    width: '100%',
    padding: 0,
    border: `0px solid ${theme.colors.extraLightGrey}`,
    borderBottomWidth: 1,
    background: 'none',
    outline: 'none',

    '&:hover': {
        borderColor: theme.colors.lightGrey,
    },
    '&:focus': {
        borderColor: theme.colors.primary,
    },
    '&[readonly]': {
        borderColor: 'transparent',
    },

    variants: {
        error: {
            true: {
                '&, &:hover, &:focus': {
                    color: theme.colors.red,
                    borderColor: theme.colors.red,
                },
            },
        },
    },
})
