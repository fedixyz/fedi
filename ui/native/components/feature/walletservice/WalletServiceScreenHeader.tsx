import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet, TextStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Column } from '../../ui/Flex'
import Header from '../../ui/Header'
import { SafeAreaContainer } from '../../ui/SafeArea'
import { ScreenTitle } from '../../ui/ScreenTitle'
import { StepDots } from '../../ui/StepDots'

/**
 * Total steps in the wallet service creation wizard.
 *
 * Owned here rather than declared per screen, so a screen cannot disagree with
 * its neighbours about how long the flow is.
 */
export const WALLET_SERVICE_STEP_COUNT = 5

/**
 * The whole top region of a wallet service screen: navigation header, step
 * dots, title, then the screen's one notification slot.
 *
 * The screens set `headerShown: false` and this renders the shared `Header`
 * itself. That is what aligns the dots with the back button and puts the top
 * safe-area inset under a single owner — a screen can no longer pay the inset
 * twice by combining a navigation header with `edges="all"`.
 *
 * The notification is a `children` slot rather than a prop so the caller keeps
 * control of which banner renders, while the position stays fixed: status
 * messages sit directly beneath the title, in reading order, never at the
 * bottom where a small screen cuts them off.
 *
 * Renders above the screen's scroll area, so the title stays put while the body
 * scrolls. It carries its own horizontal padding to line up with a body using
 * `padding="lg"`.
 */
export const WalletServiceScreenHeader: React.FC<{
    title: string
    /**
     * Overrides the title's own styling. The creation flow ends by turning its
     * heading green, which is the screen's business, not this component's.
     */
    titleStyle?: TextStyle
    /** Zero-based step. Omit to hide the dots entirely. */
    step?: number
    backButton?: boolean
    onBackButtonPress?: () => void
    /** The screen's single notification slot. */
    children?: React.ReactNode
}> = ({ title, titleStyle, step, backButton, onBackButtonPress, children }) => {
    const { theme } = useTheme()
    const insets = useSafeAreaInsets()
    const style = styles(theme)
    // page 06 has neither control, and an empty header bar would be dead space
    // on the screen with the longest wait — so the title block pays the top
    // inset itself in that case
    const hasHeaderContent = Boolean(backButton) || step !== undefined

    return (
        <>
            {hasHeaderContent && (
                <Header
                    backButton={backButton}
                    onBackButtonPress={onBackButtonPress}
                    headerCenter={
                        step === undefined ? undefined : (
                            <StepDots
                                count={WALLET_SERVICE_STEP_COUNT}
                                activeIndex={step}
                            />
                        )
                    }
                />
            )}
            <SafeAreaContainer
                edges="horizontal"
                padding="lg"
                style={[
                    style.container,
                    // `Header` pays the top inset when it renders; without one
                    // this block owes it, so the title clears the status bar
                    {
                        paddingTop: hasHeaderContent
                            ? theme.spacing.lg
                            : insets.top + theme.spacing.lg,
                    },
                ]}>
                <Column gap="lg">
                    <ScreenTitle style={titleStyle}>{title}</ScreenTitle>
                    {children}
                </Column>
            </SafeAreaContainer>
        </>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            // `SafeAreaContainer` is flex: 1 by default, which would make this
            // eat the space the body needs and push it to the bottom
            flex: 0,
            paddingBottom: theme.spacing.lg,
        },
    })
