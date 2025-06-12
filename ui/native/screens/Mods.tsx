import { useNavigation } from '@react-navigation/native'
import type { Theme } from '@rneui/themed'
import { Tooltip, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from 'react-native'

import { useNuxStep } from '@fedi/common/hooks/nux'
import { selectAllVisibleMods, setModVisibility } from '@fedi/common/redux/mod'

import FirstTimeCommunityEntryOverlay, {
    FirstTimeCommunityEntryItem,
} from '../components/feature/federations/FirstTimeCommunityEntryOverlay'
import ModsHeader from '../components/feature/fedimods/ModsHeader'
import ShortcutTile from '../components/feature/home/ShortcutTile'
import ZendeskBadge from '../components/feature/support/ZendeskBadge'
import Flex from '../components/ui/Flex'
import SvgImage from '../components/ui/SvgImage'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { FediMod, Shortcut } from '../types'
import { NavigationHook } from '../types/navigation'
import { useLaunchZendesk } from '../utils/hooks/support'
import { handleFediModNavigation } from '../utils/linking'

const Mods: React.FC = () => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()
    const dispatch = useAppDispatch()
    const mods = useAppSelector(selectAllVisibleMods)
    const { width, fontScale } = useWindowDimensions()
    const columns = width / fontScale < 300 ? 2 : 3
    const style = styles(theme, columns)

    const [actionsMod, setActionsMod] = useState<FediMod>()
    const { launchZendesk } = useLaunchZendesk()

    const [hasSeenMods, completeSeenMods] = useNuxStep('modsModal')

    const modsFirstTimeOverlayItems: FirstTimeCommunityEntryItem[] = [
        { icon: 'Apps', text: t('feature.fedimods.first-entry-option-1') },
    ]

    const onSelectFediMod = (shortcut: Shortcut) => {
        setActionsMod(undefined)
        const fediMod = shortcut as FediMod

        if (fediMod.title.toLowerCase().includes('ask fedi')) {
            launchZendesk()
        } else {
            handleFediModNavigation(fediMod, navigation)
        }
    }

    const handleModHold = (shortcut: Shortcut) => {
        setActionsMod(shortcut as FediMod)
    }

    const toggleHideMod = (modId: FediMod['id']) => {
        dispatch(setModVisibility({ modId, isHidden: true }))
        setActionsMod(undefined)
    }

    const renderFediModShortcuts = () => {
        const sorted = mods.slice().sort((a, b) => {
            if (a.title.toLowerCase() === 'ask fedi') return -1 // "Ask Fedi" comes first
            if (b.title.toLowerCase() === 'ask fedi') return 1 // Move others down
            return 0 // Maintain original order otherwise
        })
        return sorted.map((s, i) => {
            const mod = new FediMod(s)
            return (
                <View key={i} style={style.shortcut}>
                    <Tooltip
                        visible={actionsMod?.id === mod.id}
                        onClose={() => setActionsMod(undefined)}
                        withPointer
                        popover={
                            <Pressable
                                style={style.tooltipAction}
                                onPress={() => toggleHideMod(mod.id)}>
                                <Text style={style.tooltipText}>
                                    {t('words.hide')}
                                </Text>
                                <SvgImage name="Eye" />
                            </Pressable>
                        }
                        closeOnlyOnBackdropPress
                        withOverlay
                        overlayColor={theme.colors.overlay}
                        width={96}
                        backgroundColor={theme.colors.blue100}>
                        <ShortcutTile
                            shortcut={mod}
                            onSelect={onSelectFediMod}
                            onHold={handleModHold}
                        />
                        <ZendeskBadge title={mod.title} />
                    </Tooltip>
                </View>
            )
        })
    }
    // There is flexbox complexity in centering rows with 3 tiles
    // while also left-justifying rows with 1 or 2 tiles so we just
    // make sure to fill the remaining space with invisible elements
    const renderBuffers = () => {
        const count = mods.length
        const bufferCount = columns - (count % columns)
        return Array.from({ length: bufferCount }).map((_, i) => (
            <View key={i} style={[style.shortcut, style.buffer]} />
        ))
    }

    return (
        <Flex grow fullWidth basis={false}>
            <ModsHeader />
            {mods.length > 0 ? (
                <ScrollView contentContainerStyle={style.listContainer}>
                    {renderFediModShortcuts()}
                    {renderBuffers()}
                </ScrollView>
            ) : (
                <Flex center grow gap="md">
                    <Pressable
                        onPress={() => navigation.navigate('AddFediMod')}>
                        <SvgImage name="NewModIcon" size={48} />
                    </Pressable>
                    <Text>{t('feature.fedimods.add-mods-homescreen')}</Text>
                </Flex>
            )}
            <FirstTimeCommunityEntryOverlay
                overlayItems={modsFirstTimeOverlayItems}
                title={t('feature.fedimods.first-entry')}
                show={!hasSeenMods}
                onDismiss={completeSeenMods}
            />
        </Flex>
    )
}

const styles = (theme: Theme, columns: number) =>
    StyleSheet.create({
        shortcut: { width: `${100 / columns}%` },
        buffer: { height: theme.sizes.lg },
        listContainer: {
            flexDirection: 'row',
            marginTop: 4,
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            paddingHorizontal: theme.spacing.sm,
        },
        tooltipAction: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
        },
        tooltipText: { color: theme.colors.primary },
    })

export default Mods
