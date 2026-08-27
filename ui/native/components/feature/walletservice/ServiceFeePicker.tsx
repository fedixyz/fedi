import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable as NativePressable, StyleSheet, View } from 'react-native'

import { theme as fediTheme } from '@fedi/common/constants/theme'
import {
    DEFAULT_GUARDIAN_FEE_PPM,
    GUARDIAN_FEE_PPM_OPTIONS,
    MAX_GUARDIAN_FEE_PPM,
    MIN_GUARDIAN_FEE_PPM,
    guardianFeePercentToPpm,
    guardianFeePpmToPercent,
} from '@fedi/common/redux'

import { Eyebrow } from '../../ui/Eyebrow'
import { FieldInput } from '../../ui/FieldInput'
import { Column, Row } from '../../ui/Flex'
import { SegmentedControl } from '../../ui/SegmentedControl'
import SvgImage from '../../ui/SvgImage'

type FeeSelection = number | 'custom'

const MIN_FEE_PERCENT = guardianFeePpmToPercent(MIN_GUARDIAN_FEE_PPM)
const MAX_FEE_PERCENT = guardianFeePpmToPercent(MAX_GUARDIAN_FEE_PPM)

/** The prototype's number input steps in 0.1% increments. */
const FEE_STEP_PERCENT = 0.1

/**
 * The chevrons are 12pt glyphs; the slop gives each a full-size touch
 * target without growing the input.
 */
const STEPPER_HIT_SLOP = { top: 6, bottom: 6, left: 16, right: 16 }

/** The breakdown illustrates the fee against a fixed member volume. */
const BREAKDOWN_VOLUME_SATS = 100_000

const staticStyles = StyleSheet.create({
    stepperSpacer: { width: 16 },
})

/** Reserves the spinner's width inside the input's right-icon slot. */
const StepperSpacer = () => <View style={staticStyles.stepperSpacer} />

/**
 * Whole percentages keep one decimal so the presets read as a rate scale
 * (0.15% / 0.5% / 1.0%) rather than a mix of "1%" and "0.5%". Sub-percent
 * customs keep their own precision instead of being rounded into a preset.
 */
export const formatFeePercent = (percent: number) => {
    const trimmed = parseFloat(percent.toFixed(4))
    return `${Number.isInteger(trimmed) ? trimmed.toFixed(1) : trimmed}%`
}

/** Which bridge-enforced bound a rate crosses, or null when it is acceptable. */
const getOutOfRangeErrorKey = (ppm: number) => {
    if (ppm < MIN_GUARDIAN_FEE_PPM)
        return 'feature.wallet-service.fee-min-error' as const
    if (ppm > MAX_GUARDIAN_FEE_PPM)
        return 'feature.wallet-service.fee-max-error' as const
    return null
}

/**
 * The prototype's share model: one share per guardian, one for PeerBadge,
 * and four for the operator — who absorbs the rounding remainder.
 */
const getFeeBreakdown = (guardianFeePpm: number, guardianCount: number) => {
    const feeSats = (guardianFeePpm / 1_000_000) * BREAKDOWN_VOLUME_SATS
    const shares = guardianCount + 5
    const eachGuardianSats = Math.round(feeSats / shares)
    const peerBadgeSats = eachGuardianSats
    return {
        eachGuardianSats,
        peerBadgeSats,
        yourShareSats: Math.max(
            0,
            Math.round(
                feeSats - eachGuardianSats * guardianCount - peerBadgeSats,
            ),
        ),
    }
}

export interface ServiceFeeSelection {
    guardianFeePpm: number
    /** False while the entered rate is outside the bridge's bounds. */
    isValid: boolean
}

/**
 * Rate picker shared by the onboarding fee step and the settings sheet.
 *
 * Matches the prototype's `.seg` control with a custom rate input and the
 * ruled earnings breakdown beneath it.
 */
export const ServiceFeePicker: React.FC<{
    guardianCount: number
    initialPpm?: number
    onChange: (selection: ServiceFeeSelection) => void
    /** The settings sheet is too short for the breakdown. */
    showBreakdown?: boolean
    /** The settings sheet titles itself, so it hides the eyebrow. */
    showLabel?: boolean
    /** Hint rendered under the control, e.g. the settings sheet's. */
    note?: string
    onInfoPress?: () => void
}> = ({
    guardianCount,
    initialPpm = DEFAULT_GUARDIAN_FEE_PPM,
    onChange,
    showBreakdown = true,
    showLabel = true,
    note,
    onInfoPress,
}) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const [feeSelection, setFeeSelection] = useState<FeeSelection>(initialPpm)
    const [customPercent, setCustomPercent] = useState('')

    const customPpm = guardianFeePercentToPpm(parseFloat(customPercent) || 0)
    const guardianFeePpm = feeSelection === 'custom' ? customPpm : feeSelection

    // an empty custom field reads as 0 ppm, so it fails the floor check and
    // blocks saving without needing a separate "nothing entered yet" branch
    const outOfRangeKey = getOutOfRangeErrorKey(guardianFeePpm)
    const customFeeError =
        outOfRangeKey && feeSelection === 'custom' && customPercent.length > 0
            ? t(outOfRangeKey, { min: MIN_FEE_PERCENT, max: MAX_FEE_PERCENT })
            : undefined

    useEffect(() => {
        onChange({ guardianFeePpm, isValid: !outOfRangeKey })
    }, [guardianFeePpm, outOfRangeKey, onChange])

    // mirrors the prototype's number-input spinner: an empty field starts at
    // the floor, and stepping never leaves the accepted range
    const stepCustomFee = (direction: 1 | -1) => {
        const current = parseFloat(customPercent)
        const next = Number.isNaN(current)
            ? MIN_FEE_PERCENT
            : Math.min(
                  MAX_FEE_PERCENT,
                  Math.max(
                      MIN_FEE_PERCENT,
                      parseFloat(
                          (current + direction * FEE_STEP_PERCENT).toFixed(2),
                      ),
                  ),
              )
        setCustomPercent(String(next))
    }

    const breakdown = getFeeBreakdown(guardianFeePpm, guardianCount)
    const style = styles(theme)

    const breakdownRow = (
        key: string,
        label: string,
        value: number,
        testID: string,
        valueStyle: object,
        trailing?: React.ReactNode,
    ) => (
        <Row
            key={key}
            align="center"
            justify="between"
            style={[style.breakdownRow, style.breakdownRowRuled]}>
            <Row align="center" gap="xs">
                <Text style={style.breakdownKey}>{label}</Text>
                {trailing}
            </Row>
            <Text testID={testID} style={valueStyle}>
                {t('feature.wallet-service.fee-breakdown-sats', {
                    amount: value.toLocaleString(),
                })}
            </Text>
        </Row>
    )

    return (
        <Column gap="lg">
            <Column gap="sm">
                {showLabel && (
                    <Eyebrow>{t('feature.wallet-service.fee-title')}</Eyebrow>
                )}
                <SegmentedControl<FeeSelection>
                    options={[
                        ...GUARDIAN_FEE_PPM_OPTIONS.map(ppm => ({
                            label: formatFeePercent(
                                guardianFeePpmToPercent(ppm),
                            ),
                            value: ppm,
                            testID: `fee-option-${ppm}`,
                        })),
                        {
                            label: t('feature.wallet-service.fee-custom'),
                            value: 'custom' as const,
                            testID: 'fee-option-custom',
                        },
                    ]}
                    selectedValue={feeSelection}
                    onChange={setFeeSelection}
                />
                {feeSelection === 'custom' && (
                    <Column style={style.customFieldWrap}>
                        <FieldInput
                            keyboardType="decimal-pad"
                            value={customPercent}
                            onChangeText={setCustomPercent}
                            placeholder={t(
                                'feature.wallet-service.fee-custom-placeholder',
                                { min: MIN_FEE_PERCENT },
                            )}
                            rightIcon={
                                /* the spacer reserves the spinner's column
                                   inside the field so typed text can never
                                   run beneath it */
                                <Row align="center" gap="md">
                                    <StepperSpacer />
                                    <Text style={style.percentSuffix}>%</Text>
                                </Row>
                            }
                            errorMessage={customFeeError}
                        />
                        {/* the design's number-input spinner, drawn over the
                            reserved spacer so it cannot stretch the input */}
                        <Column style={style.stepper}>
                            <NativePressable
                                testID="fee-step-up"
                                style={style.stepperButton}
                                hitSlop={STEPPER_HIT_SLOP}
                                onPress={() => stepCustomFee(1)}>
                                <SvgImage
                                    name="ChevronDown"
                                    size={12}
                                    containerStyle={style.stepUpIcon}
                                />
                            </NativePressable>
                            <NativePressable
                                testID="fee-step-down"
                                style={style.stepperButton}
                                hitSlop={STEPPER_HIT_SLOP}
                                onPress={() => stepCustomFee(-1)}>
                                <SvgImage name="ChevronDown" size={12} />
                            </NativePressable>
                        </Column>
                    </Column>
                )}
            </Column>

            {note && (
                /* `.info-line`: a 12px hint led by the design's info mark */
                <Row align="start" gap="xs">
                    <SvgImage
                        name="Info"
                        size={14}
                        color={theme.colors.darkGrey}
                        containerStyle={style.noteIcon}
                    />
                    <Text style={style.noteText}>{note}</Text>
                </Row>
            )}

            {showBreakdown && (
                <Column gap={12}>
                    <Eyebrow>
                        {t('feature.wallet-service.fee-breakdown-eyebrow')}
                    </Eyebrow>
                    <Column>
                        {breakdownRow(
                            'your-share',
                            t(
                                'feature.wallet-service.fee-breakdown-your-share',
                            ),
                            breakdown.yourShareSats,
                            'fee-breakdown-your-share',
                            style.breakdownYourShare,
                        )}
                        {breakdownRow(
                            'each-guardian',
                            t(
                                'feature.wallet-service.fee-breakdown-each-guardian',
                            ),
                            breakdown.eachGuardianSats,
                            'fee-breakdown-each-guardian',
                            style.breakdownValue,
                        )}
                        {breakdownRow(
                            'peerbadge',
                            t('feature.wallet-service.fee-breakdown-peerbadge'),
                            breakdown.peerBadgeSats,
                            'fee-breakdown-peerbadge',
                            style.breakdownValue,
                            onInfoPress ? (
                                <NativePressable
                                    testID="fee-peerbadge-info"
                                    hitSlop={8}
                                    onPress={onInfoPress}>
                                    <SvgImage
                                        name="Info"
                                        size={14}
                                        color={theme.colors.darkGrey}
                                    />
                                </NativePressable>
                            ) : undefined,
                        )}
                    </Column>
                </Column>
            )}
        </Column>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        breakdownKey: {
            color: theme.colors.darkGrey,
            fontSize: fediTheme.fontSizes.caption,
        },
        breakdownRow: {
            paddingVertical: 7,
        },
        breakdownRowRuled: {
            borderTopColor: theme.colors.dividerGrey,
            borderTopWidth: 1,
        },
        breakdownValue: {
            color: theme.colors.primary,
            fontSize: fediTheme.fontSizes.caption,
            fontWeight: '500',
        },
        breakdownYourShare: {
            color: theme.colors.success,
            fontSize: fediTheme.fontSizes.caption,
            fontWeight: '700',
        },
        customFieldWrap: {
            position: 'relative',
        },
        percentSuffix: {
            color: theme.colors.darkGrey,
            fontSize: fediTheme.fontSizes.body,
            fontWeight: '600',
        },
        stepper: {
            alignItems: 'center',
            gap: 2,
            height: 50,
            justifyContent: 'center',
            position: 'absolute',
            right: 46,
            top: 0,
            width: 20,
        },
        stepperButton: {
            alignItems: 'center',
            height: 13,
            justifyContent: 'center',
            width: 20,
        },
        noteIcon: {
            paddingTop: 1,
        },
        noteText: {
            color: theme.colors.darkGrey,
            flex: 1,
            fontSize: fediTheme.fontSizes.small,
            lineHeight: 18,
        },
        stepUpIcon: {
            transform: [{ rotate: '180deg' }],
        },
    })
