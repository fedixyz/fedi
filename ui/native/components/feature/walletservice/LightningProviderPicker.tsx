import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, StyleSheet } from 'react-native'

import { theme as fediTheme } from '@fedi/common/constants/theme'

import { SERVICE_BADGE_GREY } from '../../../constants/walletServiceTheme'
import { Column, Row } from '../../ui/Flex'
import { Pressable } from '../../ui/Pressable'
import { ProviderCard } from '../../ui/ProviderCard'
import SvgImage from '../../ui/SvgImage'
import {
    LightningBanner,
    LightningProviderBanner,
} from './LightningProviderBanner'

/**
 * Bring-your-own is documentation, not an option.
 *
 * Nothing in the liquidity contract configures a self-hosted gateway, so a
 * second selectable card would record a choice and configure nothing. A link to
 * the gateway guide is the honest treatment of a path the app cannot walk.
 */
const GATEWAY_GUIDE_URL =
    'https://fedibtc.github.io/fedi-docs/docs/gateways/intro'

export type LightningProviderPickerProps = {
    /** Whether the card reads as chosen. */
    isSelected: boolean
    /**
     * Omit to fix the card. Two hosts do that for two reasons: the settings
     * sheet after a provider is attached, because the attach is one-way, and
     * either host while a request is running, because there is nothing to
     * change until it answers.
     */
    onToggle?: () => void
    /**
     * Whether a gateway view has actually been verified for this federation.
     *
     * The VERIFIED pill answers to this and nothing else. A pill on a card that
     * is merely ticked asserts a capability the federation does not have — the
     * exact claim the settings sheet used to make with no gateway at all.
     */
    isAttached: boolean
    banner?: LightningBanner | null
}

/**
 * The Lightning provider card, shared by the creation step and the settings
 * sheet. Matches the prototype's `#ln-onboard-list` and `#provider-switch-list`.
 *
 * There is one provider, so this is a tick rather than a choice between cards.
 * Ticking is deliberately inert: it records what the user wants and nothing
 * else, and the host's Continue is the only thing that requests anything.
 */
export const LightningProviderPicker: React.FC<
    LightningProviderPickerProps
> = ({ isSelected, onToggle, isAttached, banner }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const style = styles(theme)

    return (
        <Column gap="lg" fullWidth>
            {banner && (
                <LightningProviderBanner
                    banner={banner}
                    testID="lightning-banner"
                />
            )}

            <ProviderCard
                testID="lightning-managed-option"
                icon="Bolt"
                name={t('feature.wallet-service.lightning-managed')}
                description={t(
                    'feature.wallet-service.lightning-managed-detail',
                )}
                // VERIFIED is a claim about the federation and answers to
                // `isAttached`; RECOMMENDED is only advice about which provider
                // to pick, so it stands before anything is attached
                badge={t(
                    isAttached
                        ? 'feature.wallet-service.lightning-verified'
                        : 'feature.wallet-service.recommended',
                )}
                isSelected={isSelected}
                onPress={onToggle}
                // a card with no handler reports state rather than offering a
                // choice, and must not show a tick that invites a press
                isStatic={!onToggle}
            />

            {/* not a provider card: it configures nothing, so it carries no
                tick and no selected state. White whatever else is chosen —
                being unpicked is not a state it can be in. */}
            <Pressable
                testID="lightning-byo-link"
                onPress={() => Linking.openURL(GATEWAY_GUIDE_URL)}
                containerStyle={style.byoRow}>
                <Row align="center" gap={12} grow>
                    <Row center style={style.byoIconTile}>
                        <SvgImage name="Globe" size={18} />
                    </Row>
                    <Column gap="xxs" grow shrink>
                        <Row align="center" gap={6} style={style.byoNameRow}>
                            <Text style={style.byoTitle}>
                                {t('feature.wallet-service.lightning-byo')}
                            </Text>
                            <Row center style={style.byoBadge}>
                                <Text style={style.byoBadgeText}>
                                    {t('words.advanced').toUpperCase()}
                                </Text>
                            </Row>
                        </Row>
                        <Text style={style.noteText}>
                            {t('feature.wallet-service.lightning-byo-detail')}
                        </Text>
                        {/* the link is the action, so it reads as one rather
                            than leaving a bare glyph to carry the affordance */}
                        <Row align="center" gap={4}>
                            <Text style={style.byoLink}>
                                {t(
                                    'feature.wallet-service.lightning-byo-guide',
                                )}
                            </Text>
                            <SvgImage
                                name="ExternalLink"
                                size={12}
                                color={theme.colors.primary}
                            />
                        </Row>
                    </Column>
                </Row>
            </Pressable>

            {/* what is true right now, in the order the user needs it: what is
                attached, or — if they have just untied the only provider —
                what that costs their members */}
            <Text style={style.noteText}>
                {t(
                    isAttached
                        ? 'feature.wallet-service.lightning-manage-note'
                        : !isSelected
                          ? 'feature.wallet-service.lightning-declined-note'
                          : 'feature.wallet-service.lightning-not-attached-note',
                )}
            </Text>
        </Column>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        byoRow: {
            // always white: this row is a link, so it has no unpicked state to
            // render as the flat grey a passed-over provider card uses
            backgroundColor: theme.colors.white,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: theme.colors.dividerGrey,
            // axis-specific, because Pressable's base container sets
            // paddingVertical/Horizontal and those beat the shorthand
            paddingHorizontal: 14,
            paddingVertical: 14,
        },
        byoIconTile: {
            backgroundColor: theme.colors.grey100,
            borderRadius: 10,
            height: 36,
            width: 36,
        },
        byoNameRow: {
            // hugs its content so the badge sits against the name rather than
            // being pushed to the card's far edge
            alignSelf: 'flex-start',
            maxWidth: '100%',
        },
        byoTitle: {
            color: theme.colors.primary,
            flexShrink: 1,
            fontSize: 14,
            fontWeight: '600',
            lineHeight: 21,
        },
        byoBadge: {
            backgroundColor: theme.colors.grey100,
            borderRadius: 999,
            paddingHorizontal: 7,
            paddingVertical: 2,
        },
        byoBadgeText: {
            color: SERVICE_BADGE_GREY,
            fontSize: 9,
            fontWeight: '700',
            letterSpacing: 0.5,
        },
        byoLink: {
            color: theme.colors.primary,
            fontSize: fediTheme.fontSizes.small,
            fontWeight: '500',
            lineHeight: 18,
            textDecorationLine: 'underline',
        },
        noteText: {
            color: theme.colors.darkGrey,
            flex: 1,
            fontSize: fediTheme.fontSizes.small,
            lineHeight: 18,
        },
    })
