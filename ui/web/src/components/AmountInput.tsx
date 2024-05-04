import React, { useCallback, useEffect, useRef } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import arrowLeftIcon from '@fedi/common/assets/svgs/arrow-left.svg'
import switchIcon from '@fedi/common/assets/svgs/switch.svg'
import { useAmountInput } from '@fedi/common/hooks/amount'
import { Sats } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'

import { useMediaQuery } from '../hooks'
import { config, keyframes, styled, theme } from '../styles'
import { Icon } from './Icon'
import { Text } from './Text'

interface Props {
    amount: Sats
    readOnly?: boolean
    verb?: string
    minimumAmount?: Sats | null
    maximumAmount?: Sats | null
    submitAttempts?: number
    autoFocus?: boolean
    extraInput?: React.ReactNode
    onChangeAmount?: (amount: Sats) => void
}

export const AmountInput: React.FC<Props> = ({
    amount,
    readOnly,
    verb,
    minimumAmount,
    maximumAmount,
    submitAttempts = 0,
    autoFocus,
    extraInput,
    onChangeAmount,
}) => {
    const { t } = useTranslation()
    const {
        isFiat,
        setIsFiat,
        satsValue,
        fiatValue,
        handleChangeFiat,
        handleChangeSats,
        currency,
        numpadButtons,
        handleNumpadPress,
        validation,
    } = useAmountInput(amount, onChangeAmount, minimumAmount, maximumAmount)
    const isSmall = useMediaQuery(config.media.sm)
    const errorElRef = useRef<HTMLDivElement | null>(null)
    const amountInputContainerElRef = useRef<HTMLDivElement | null>(null)

    // Wiggle the error on subsequent submit attempts.
    useEffect(() => {
        const errorEl = errorElRef.current
        if (submitAttempts < 2 || !errorEl) return
        errorEl.animate(
            [
                { transform: 'translateX(0)' },
                { transform: 'translateX(6px)' },
                { transform: 'translateX(-4px)' },
                { transform: 'translateX(2px)' },
                { transform: 'translateX(0)' },
            ],
            {
                duration: 200,
                iterations: 1,
            },
        )
    }, [submitAttempts])

    // Check validation for errors to render with suggestion for amount.
    let error: React.ReactNode | undefined
    if (validation && (!validation.onlyShowOnSubmit || submitAttempts)) {
        // The way we handle clicking validation amount is:
        // 1. Fade out input container
        // 2. Disable field wrap transitions
        // 3. Change the amount
        // 4. Fade in input container
        // 5. Re-enable field wrap transitions
        const handleClickValidationAmount = () => {
            const containerEl = amountInputContainerElRef.current
            if (!containerEl) {
                handleChangeSats(validation.amount.toString())
                return
            }
            const fieldWrapEls = containerEl.querySelectorAll<HTMLDivElement>(
                FieldWrap.selector,
            )
            const fadeOut = containerEl.animate(
                [{ opacity: 1 }, { opacity: 0 }],
                { duration: 300, iterations: 1 },
            )
            fadeOut.onfinish = () => {
                handleChangeSats(validation.amount.toString())
                fieldWrapEls.forEach(el => (el.style.transition = 'none'))
                requestAnimationFrame(() => {
                    containerEl.animate([{ opacity: 0 }, { opacity: 1 }], {
                        duration: 300,
                        iterations: 1,
                    })
                    requestAnimationFrame(() => {
                        fieldWrapEls.forEach(el =>
                            el.style.removeProperty('transition'),
                        )
                    })
                })
            }
        }
        error = (
            <Trans
                i18nKey={validation.i18nKey}
                components={{
                    suggestion: (
                        <ErrorAmountButton
                            onClick={handleClickValidationAmount}
                        />
                    ),
                }}
                values={{
                    verb: verb?.toLowerCase() || t('words.send'),
                    amount: `${amountUtils.formatSats(validation.amount)} ${t(
                        'words.sats',
                    )}`,
                }}
            />
        )
    }

    const activeWrapProps = {
        active: true,
        readOnly,
        autoFocus,
        hasError: !!error,
        onClick: useCallback(
            (ev: React.MouseEvent) => {
                if (!isSmall) {
                    ev.currentTarget.querySelector('input')?.focus()
                }
            },
            [isSmall],
        ),
    }
    const activeInputProps = {
        autoFocus,
        readOnly,
    }
    const inactiveWrapProps = {
        active: false,
        readOnly,
        hasError: !!error,
        role: readOnly ? undefined : 'button',
        tabIndex: readOnly ? undefined : 0,
        onClick: useCallback(
            (ev: React.MouseEvent) => {
                if (readOnly) return
                setIsFiat(!isFiat)
                if (!isSmall) {
                    ev.currentTarget.querySelector('input')?.focus()
                }
            },
            [readOnly, setIsFiat, isSmall, isFiat],
        ),
    }
    const inactiveInputProps = {
        autoFocus: false,
        readOnly: true,
    }

    return (
        <Container>
            <InputContainer>
                <AmountInputContainer
                    ref={amountInputContainerElRef}
                    css={{
                        '--error-height-offset': error
                            ? '0px'
                            : `${errorHeight / 2}px`,
                    }}>
                    <FieldWrap
                        {...(isFiat ? inactiveWrapProps : activeWrapProps)}>
                        <SnugInput>
                            <input
                                {...(isFiat
                                    ? inactiveInputProps
                                    : activeInputProps)}
                                value={satsValue}
                                onChange={ev =>
                                    handleChangeSats(ev.currentTarget.value)
                                }
                            />
                            <div>{satsValue}</div>
                        </SnugInput>
                        <Suffix>{t('words.sats')}</Suffix>
                        <Icon icon={switchIcon} />
                    </FieldWrap>
                    <FieldWrap
                        {...(isFiat ? activeWrapProps : inactiveWrapProps)}>
                        <SnugInput>
                            <input
                                {...(isFiat
                                    ? activeInputProps
                                    : inactiveInputProps)}
                                readOnly={!isFiat || readOnly}
                                value={fiatValue}
                                inputMode="decimal"
                                onChange={ev =>
                                    handleChangeFiat(ev.currentTarget.value)
                                }
                            />
                            <div>{fiatValue}</div>
                        </SnugInput>
                        <Suffix>{currency}</Suffix>
                        <Icon icon={switchIcon} />
                    </FieldWrap>
                    {error && (
                        <Error
                            needsReminder={submitAttempts > 1}
                            ref={errorElRef}>
                            <Text variant="caption" weight="medium">
                                {error}
                            </Text>
                        </Error>
                    )}
                </AmountInputContainer>
                {extraInput}
            </InputContainer>
            {!readOnly && (
                <NumpadContainer>
                    {numpadButtons.map(btn => (
                        <NumpadButton
                            key={btn}
                            isPlaceholder={btn === null}
                            onClick={() => handleNumpadPress(btn)}>
                            {btn === 'backspace' ? (
                                <Icon icon={arrowLeftIcon} />
                            ) : (
                                btn
                            )}
                        </NumpadButton>
                    ))}
                </NumpadContainer>
            )}
        </Container>
    )
}

const fieldsHeight = 88
const errorHeight = 28

const Container = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 24,
    overflow: 'hidden',
})

const InputContainer = styled('div', {
    flex: 1,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    gap: 24,
})

const AmountInputContainer = styled('div', {
    width: '100%',
    position: 'relative',
    height: fieldsHeight + errorHeight,
})

const errorFade = keyframes({
    '0%': { opacity: 0, transform: 'translateY(10px)' },
    '100%': { opacity: 1, transform: 'translateY(0)' },
})

const errorReminder = keyframes({
    '0%': { transform: 'translateX(0)' },
    '20%': { transform: 'translateX(8px)' },
    '40%': { transform: 'translateX(-4px)' },
    '60%': { transform: 'translateX(2px)' },
    '100%': { transform: 'translateX(0)' },
})

const Error = styled('div', {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: theme.colors.red,
    animation: `${errorFade} 200ms linear`,

    variants: {
        needsReminder: {
            true: {
                animation: `${errorReminder} 100ms ease`,
            },
        },
    },
})

const ErrorAmountButton = styled('button', {
    textDecoration: 'underline',
    textTransform: 'uppercase',
})

const switchIconFade = keyframes({
    '0%': { opacity: 0 },
    '100%': { opacity: 1 },
})

const Suffix = styled('span', {
    paddingLeft: 6,
    fontSize: 32,
    lineHeight: '48px',
    textTransform: 'uppercase',
    fontWeight: theme.fontWeights.medium,
    transformOrigin: '10% 70%',
    transition: 'transform 200ms ease',
})

const FieldWrap = styled('div', {
    position: 'absolute',
    left: '50%',
    top: 0,
    width: '100%',
    maxWidth: '100%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-end',
    transition: 'transform 200ms ease, color 200ms ease, opacity 200ms ease',

    '> *': {
        flexShrink: 0,
    },

    // Switch icon
    '> svg': {
        flexShrink: 0,
        position: 'relative',
        top: -12,
        marginLeft: 6,
        animation: `${switchIconFade} 200ms ease 200ms 1 both`,
    },

    variants: {
        active: {
            true: {
                transform: `
                    translateX(-50%)
                    translateX(22px)
                    translateY(var(--error-height-offset))
                `,

                '> svg': {
                    opacity: 0,
                    animation: 'none',
                },

                [`& ${Suffix}`]: {
                    transform: 'scale(0.7)',
                },
            },
            false: {
                opacity: 0.5,
                transform: `
                    translateX(-50%)
                    translateY(var(--error-height-offset))
                    translateY(${fieldsHeight}px)
                    translateY(-100%)
                    scale(0.6)
                `,
                cursor: 'pointer',

                '&:hover, &:focus': {
                    opacity: 0.6,
                },

                '> *': {
                    pointerEvents: 'none',
                },
            },
        },
        readOnly: {
            true: {
                cursor: 'default !important',
            },
        },
    },
})

const SnugInput = styled('div', {
    height: 48,
    position: 'relative',

    '& > div, & > input': {
        fontSize: 32,
        lineHeight: '48px',
        fontWeight: theme.fontWeights.medium,
    },

    '& > div': {
        opacity: 0,
        visibility: 'hidden',
    },

    '& > input': {
        position: 'absolute',
        inset: 0,
        background: 'none',
        border: 'none',
        padding: 0,
        outline: 'none',
    },
})

const NumpadContainer = styled('div', {
    display: 'none',
    width: '100%',
    maxWidth: 400,

    '@sm': {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: 'repeat(4, 1fr)',
        gap: 8,
    },

    '@media (max-height: 640px)': {
        display: 'none',
    },
})

const NumpadButton = styled('button', {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    borderRadius: 8,
    fontSize: 20,
    fontWeight: theme.fontWeights.medium,
    lineHeight: '32px',
    transition: 'background-color 80ms ease',

    '@media (max-height: 760px)': {
        padding: 16,
    },

    '@media (max-height: 700px)': {
        lineHeight: '28px',
        padding: 12,
    },

    '&:hover, &:focus': {
        background: theme.colors.primary05,
        outline: 'none',
    },
    '&:active': {
        background: theme.colors.primary10,
        outline: 'none',
    },

    variants: {
        isPlaceholder: {
            true: {
                visibility: 'hidden',
            },
        },
    },
})
