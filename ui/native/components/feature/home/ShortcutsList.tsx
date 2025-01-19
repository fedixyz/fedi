import { useNavigation } from '@react-navigation/native'
import type { Theme } from '@rneui/themed'
import { useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Dimensions,
    Linking,
    Pressable,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from 'react-native'

import { useCommonSelector } from '@fedi/common/hooks/redux'
import { selectActiveFederationId } from '@fedi/common/redux'
import {
    selectVisibleCommunityMods,
    setModVisibility,
} from '@fedi/common/redux/mod'

import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { FediMod, Shortcut } from '../../../types'
import { NavigationHook } from '../../../types/navigation'
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

    const onSelectFediMod = (shortcut: Shortcut) => {
        const fediMod = shortcut as FediMod
        // Handle telegram and whatsapp links natively
        if (
            fediMod.url.includes('https://t.me') ||
            fediMod.url.includes('https://wa.me')
        ) {
            Linking.openURL(fediMod.url)
        } else {
            navigation.navigate('FediModBrowser', { fediMod })
        }
    }

    const handleModHold = (shortcut: Shortcut) => {
        const fediMod = shortcut as FediMod
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
    const renderFediModShortcuts = () => {
        const fediModShortcuts = fediMods.map(s => new FediMod(s))
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
        const totalShortcuts = fediMods.length
        const bufferCount = (columns - (totalShortcuts % columns)) % columns

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
        <View style={style.container}>
            <View style={style.listContainer}>
                {renderFediModShortcuts()}
                {renderBuffers()}
            </View>
        </View>
    )
}

const styles = (theme: Theme, columns: number) =>
    StyleSheet.create({
        container: {
            flex: 1,
            width: '100%',
        },
        shortcut: {
            width: `${100 / columns}%`,
        },
        buffer: {
            height: theme.sizes.lg,
        },
        listContainer: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'space-between',

            // This is smaller than the designs because
            // the tiles already have some padding
            rowGap: theme.spacing.md,
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
