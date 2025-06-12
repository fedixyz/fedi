import { useNavigation } from '@react-navigation/native'
import type { Theme } from '@rneui/themed'
import { useTheme, Text } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Dimensions,
    Pressable,
    StyleSheet,
    View,
    useWindowDimensions,
} from 'react-native'

import { useCommonSelector } from '@fedi/common/hooks/redux'
import {
    selectActiveFederationId,
    selectActiveFederationHasWallet,
} from '@fedi/common/redux'
import {
    selectVisibleCommunityMods,
    setModVisibility,
} from '@fedi/common/redux/mod'

import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { FediMod, Shortcut } from '../../../types'
import { NavigationHook } from '../../../types/navigation'
import { handleFediModNavigation } from '../../../utils/linking'
import Flex from '../../ui/Flex'
import SvgImage from '../../ui/SvgImage'
import { Tooltip } from '../../ui/Tooltip'
import ShortcutTile from './ShortcutTile'

const ShortcutsList: React.FC = () => {
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()
    const fediMods = useAppSelector(selectVisibleCommunityMods)
    const { width, fontScale } = useWindowDimensions()
    const { t } = useTranslation()
    const [actionsMod, setActionsMod] = useState<FediMod>()
    const dispatch = useAppDispatch()
    const activeFederationId = useCommonSelector(selectActiveFederationId)
    const [federationId] = useState(activeFederationId)
    const columns = width / fontScale < 300 ? 2 : 3
    const style = styles(theme, columns)

    const isFederation = useAppSelector(selectActiveFederationHasWallet)

    const onSelectFediMod = (shortcut: Shortcut) => {
        handleFediModNavigation(shortcut, navigation)
    }

    const handleModHold = (fediMod: FediMod) => {
        setActionsMod(fediMod)
    }

    const toggleHideMod = (modId: FediMod['id']) => {
        dispatch(
            setModVisibility({
                modId,
                isHiddenCommunity: true,
                federationId: federationId,
            }),
        )
        setActionsMod(undefined)
    }

    //remove 'ask fedi' and 'support' mods
    const getValidFediMods = () => {
        return fediMods
            .filter(s => s.title !== 'Ask Fedi' && s.title !== 'Support')
            .map(s => new FediMod(s))
    }

    const totalMods = getValidFediMods().length

    if (totalMods === 0) {
        return null
    }

    const renderFediModShortcuts = () => {
        const fediModShortcuts = getValidFediMods()

        return fediModShortcuts.map((s: FediMod) => {
            return (
                <View key={`fediMod-s-${s.id}`} style={style.shortcut}>
                    {/* an invisible overlay so we can hide the tooltip on outside press */}
                    <Pressable
                        style={style.tooltipOverlay}
                        onPress={() => setActionsMod(undefined)}
                    />
                    <Tooltip
                        shouldShow={actionsMod?.id === s.id}
                        orientation="above"
                        verticalOffset={96}
                        horizontalOffset={48}
                        text="">
                        <Pressable
                            style={style.tooltipAction}
                            onPress={() => toggleHideMod(s.id)}>
                            <Text style={style.tooltipText}>
                                {t('words.hide')}
                            </Text>
                            <SvgImage name="Eye" />
                        </Pressable>
                    </Tooltip>
                    <ShortcutTile
                        shortcut={s}
                        onSelect={onSelectFediMod}
                        onHold={handleModHold}
                    />
                </View>
            )
        })
    }
    // There is flexbox complexity in centering rows with 3 tiles
    // while also left-justifying rows with 1 or 2 tiles so we just
    // make sure to fill the remaining space with invisible elements
    const renderBuffers = () => {
        const bufferCount = (columns - (totalMods % columns)) % columns

        return new Array(bufferCount).fill('').map((_, i) => {
            return (
                <View
                    key={`buffer-s-${i}`}
                    style={[style.shortcut, style.buffer]}
                />
            )
        })
    }

    return (
        <Flex grow fullWidth>
            <Text style={style.sectionTitle}>
                {isFederation
                    ? t('feature.home.federation-mods-title')
                    : t('feature.home.community-mods-title')}
            </Text>
            <Text style={style.servicesSelected}>
                {isFederation
                    ? t('feature.home.federation-services-selected')
                    : t('feature.home.community-services-selected')}
            </Text>
            <Flex
                row
                wrap
                justify="between"
                style={{ rowGap: theme.spacing.md }}>
                {renderFediModShortcuts()}
                {renderBuffers()}
            </Flex>
        </Flex>
    )
}

const styles = (theme: Theme, columns: number) =>
    StyleSheet.create({
        shortcut: {
            width: `${100 / columns}%`,
        },
        buffer: {
            height: theme.sizes.lg,
        },
        sectionTitle: {
            color: theme.colors.night,
            letterSpacing: -0.16,
            fontSize: 20,
            marginBottom: 4,
        },
        servicesSelected: {
            fontFamily: 'Albert Sans',
            fontWeight: '400',
            fontSize: 14,
            lineHeight: 18,
            color: theme.colors.darkGrey,
            letterSpacing: -0.14,
            marginBottom: 12,
        },
        tooltipAction: {
            flexDirection: 'row',
            gap: theme.sizes.xs,
        },
        tooltipText: {
            color: theme.colors.primary,
        },
        tooltipOverlay: {
            height: Dimensions.get('window').height,
            width: Dimensions.get('window').width,
            position: 'absolute',
        },
    })

export default ShortcutsList
