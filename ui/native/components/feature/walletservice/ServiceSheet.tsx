import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet } from 'react-native'

import { theme as fediTheme } from '@fedi/common/constants/theme'

import { SERVICE_CARD_BG } from '../../../constants/walletServiceTheme'
import { useKeyboard } from '../../../utils/hooks/keyboard'
import CustomOverlay from '../../ui/CustomOverlay'
import { Column, Row } from '../../ui/Flex'
import { PressableIcon } from '../../ui/PressableIcon'
import { ScreenTitle } from '../../ui/ScreenTitle'
import { SheetDescription } from '../../ui/SheetDescription'
import { SheetHandle } from '../../ui/SheetHandle'
import SvgImage from '../../ui/SvgImage'
import { MilestoneSpinner } from './MilestoneSpinner'

export interface ServiceSheetButton {
    text: string
    /** Filled ink pill; everything else is an outlined pill. */
    primary?: boolean
    disabled?: boolean
    testID?: string
    onPress: () => void
}

/**
 * Bottom sheet for the wallet service flow.
 *
 * `CustomOverlay` centres its title and outlines secondary buttons in ink,
 * where this design left-aligns the header and outlines in `lightGrey`, so
 * the header and the buttons are both supplied as nodes.
 */
export const ServiceSheet: React.FC<{
    show: boolean
    title?: string
    description?: string
    /** Hint in a bordered grey card — the design's `.note-line`. */
    note?: string
    loading?: boolean
    /** Close icon beside the title; tapping it calls `onDismiss`. */
    showClose?: boolean
    closeTestID?: string
    /** See `CustomOverlay`'s `tall`. */
    tall?: boolean
    onDismiss: () => void
    /** Rendered in order, primary first. */
    buttons: ServiceSheetButton[]
    children?: React.ReactNode
}> = ({
    show,
    title,
    description,
    note,
    loading,
    showClose = false,
    closeTestID,
    tall,
    onDismiss,
    buttons,
    children,
}) => {
    const { theme } = useTheme()
    const {
        isVisible: isKeyboardVisible,
        height: keyboardHeight,
        insets,
    } = useKeyboard()
    const style = styles(theme)

    // the sheet is anchored to the bottom of the window, so an open keyboard
    // covers its buttons — a sheet with a text field would otherwise offer a
    // Save the user cannot reach. `insets.bottom` already sits inside the
    // reported keyboard height, so subtracting it avoids a double gap.
    const keyboardInset = isKeyboardVisible
        ? Math.max(keyboardHeight - insets.bottom, 0)
        : 0

    return (
        <CustomOverlay
            show={show}
            loading={loading}
            tall={tall}
            onBackdropPress={onDismiss}
            contents={{
                title: (
                    <Column fullWidth style={style.sheetInset}>
                        <SheetHandle />
                        {(title || description) && (
                            <Column gap="xs">
                                {title &&
                                    (showClose ? (
                                        <Row align="start" gap="sm">
                                            <ScreenTitle style={style.grow}>
                                                {title}
                                            </ScreenTitle>
                                            <PressableIcon
                                                testID={closeTestID}
                                                svgName="Close"
                                                svgProps={{
                                                    color: theme.colors
                                                        .darkGrey,
                                                    size: 20,
                                                }}
                                                onPress={onDismiss}
                                            />
                                        </Row>
                                    ) : (
                                        <ScreenTitle>{title}</ScreenTitle>
                                    ))}
                                {description && (
                                    <SheetDescription>
                                        {description}
                                    </SheetDescription>
                                )}
                            </Column>
                        )}
                    </Column>
                ),
                body: (
                    <Column
                        fullWidth
                        gap="lg"
                        style={[
                            style.sheetInset,
                            { paddingBottom: keyboardInset },
                        ]}>
                        {children}
                        {note && (
                            <Row align="start" gap="sm" style={style.note}>
                                <SvgImage
                                    name="Info"
                                    size={15}
                                    color={theme.colors.darkGrey}
                                    containerStyle={style.noteIcon}
                                />
                                <Text style={style.noteText}>{note}</Text>
                            </Row>
                        )}
                        <Column fullWidth gap={8}>
                            {buttons.map(button =>
                                loading && button.primary ? (
                                    // the journey's own ring rather than the
                                    // platform's spokes, in a box the height
                                    // of the button it replaces so the sheet
                                    // does not resize
                                    <Row
                                        key={button.text}
                                        center
                                        testID={
                                            button.testID &&
                                            `${button.testID}-busy`
                                        }
                                        style={style.busy}>
                                        <MilestoneSpinner />
                                    </Row>
                                ) : (
                                    <Button
                                        key={button.text}
                                        testID={button.testID}
                                        fullWidth
                                        title={button.text}
                                        disabled={
                                            loading ? true : button.disabled
                                        }
                                        onPress={button.onPress}
                                        buttonStyle={[
                                            style.button,
                                            button.primary
                                                ? style.buttonPrimary
                                                : style.buttonSecondary,
                                        ]}
                                        titleStyle={[
                                            style.buttonTitle,
                                            button.primary
                                                ? style.buttonTitlePrimary
                                                : style.buttonTitleSecondary,
                                        ]}
                                    />
                                ),
                            )}
                        </Column>
                    </Column>
                ),
            }}
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        sheetInset: {
            // CustomOverlay insets 12pt where the design insets 20pt
            paddingHorizontal: 8,
        },
        grow: {
            flex: 1,
        },
        busy: {
            minHeight: theme.sizes.lg,
        },
        note: {
            backgroundColor: SERVICE_CARD_BG,
            borderColor: theme.colors.dividerGrey,
            borderRadius: 12,
            borderWidth: 1,
            paddingHorizontal: 12,
            paddingVertical: 10,
        },
        noteIcon: {
            paddingTop: 1,
        },
        noteText: {
            color: theme.colors.darkGrey,
            flex: 1,
            fontSize: fediTheme.fontSizes.caption,
            lineHeight: 20,
        },
        button: {
            borderRadius: 999,
            borderWidth: 1,
            paddingVertical: 14,
        },
        buttonPrimary: {
            // the journey's primary CTA is the shared Button's night gradient.
            // This only restates the sheen the Button theme already applies —
            // the ink under it is RNEUI's own backgroundColor, which is why no
            // colour is set here. On a bare Pressable the sheen alone renders
            // as a pale grey pill; see `WalletServiceTour`'s nextButton.
            experimental_backgroundImage: `linear-gradient(180deg, ${fediTheme.nightLinearGradient.join(', ')})`,
            borderColor: 'transparent',
        },
        buttonSecondary: {
            backgroundColor: 'transparent',
            // the design outlines in grey, not ink
            borderColor: theme.colors.lightGrey,
        },
        buttonTitle: {
            fontSize: fediTheme.fontSizes.caption,
            fontWeight: '600',
        },
        buttonTitlePrimary: {
            color: theme.colors.secondary,
        },
        buttonTitleSecondary: {
            color: theme.colors.primary,
        },
    })
