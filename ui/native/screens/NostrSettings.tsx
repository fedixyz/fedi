import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context'

import { selectNostrNpub, selectNostrNsec } from '@fedi/common/redux'
import { CopyButton } from '../components/ui/CopyButton'
import HoloLoader from '../components/ui/HoloLoader'
import { PressableIcon } from '../components/ui/PressableIcon'
import { useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'NostrSettings'>

const NostrSettings: React.FC<Props> = (_: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const insets = useSafeAreaInsets()

    const nostrPublic = useAppSelector(selectNostrNpub)
    const nostrSecret = useAppSelector(selectNostrNsec)
    const [showNsec, setShowNsec] = useState(false)

    const style = styles(theme, insets)

    return (
        <View style={style.container}>
            <View style={style.section}>
                <View style={style.header}>
                    <Text medium>{t('feature.nostr.nostr-public-key')}</Text>
                    {nostrPublic && <CopyButton value={nostrPublic.npub} />}
                </View>
                {nostrPublic ? (
                    <Text
                        caption
                        color={theme.colors.darkGrey}
                        numberOfLines={1}
                        ellipsizeMode="middle">
                        {nostrPublic.npub}
                    </Text>
                ) : (
                    <HoloLoader size={32} />
                )}
            </View>
            <View style={style.section}>
                <View style={style.header}>
                    <Text medium>{t('feature.nostr.nostr-secret-key')}</Text>
                    {nostrSecret && (
                        <View style={style.iconSpacer}>
                            <PressableIcon
                                onPress={() => setShowNsec(!showNsec)}
                                svgProps={{
                                    size: 16,
                                    color: theme.colors.grey,
                                }}
                                svgName={showNsec ? 'EyeClosed' : 'Eye'}
                                containerStyle={style.pressableIcon}
                            />
                            <CopyButton value={nostrSecret.nsec || ''} />
                        </View>
                    )}
                </View>
                {nostrSecret ? (
                    <Text
                        caption
                        color={theme.colors.darkGrey}
                        numberOfLines={1}
                        ellipsizeMode={showNsec ? 'middle' : 'clip'}>
                        {showNsec ? nostrSecret.nsec : '•'.repeat(63)}
                    </Text>
                ) : (
                    <HoloLoader size={32} />
                )}
            </View>
        </View>
    )
}

const styles = (theme: Theme, insets: EdgeInsets) =>
    StyleSheet.create({
        container: {
            flex: 1,
            width: '100%',
            flexDirection: 'column',
            gap: theme.spacing.lg,
            paddingTop: theme.spacing.lg,
            paddingLeft: insets.left + theme.spacing.lg,
            paddingRight: insets.right + theme.spacing.lg,
            paddingBottom: Math.max(insets.bottom, theme.spacing.lg),
        },
        section: {
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
        },
        header: {
            display: 'flex',
            gap: 8,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
        },
        iconSpacer: {
            flex: 1,
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
        },
        switchContainer: {
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            gap: 8,
        },
        content: {
            flex: 1,
            flexDirection: 'column',
            gap: 16,
        },
        textInputInner: {
            borderBottomWidth: 0,
            height: '100%',
        },
        textInputOuter: {
            width: '100%',
            borderColor: theme.colors.primaryVeryLight,
            borderWidth: 1,
            borderRadius: 8,
            height: 36,
        },
        input: {
            fontSize: 14,
        },
        card: {
            borderColor: theme.colors.lightGrey,
            borderWidth: 1,
            borderRadius: 12,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
        },
        pressableIcon: {
            width: 'auto',
            flexGrow: 0,
            flexShrink: 0,
            paddingHorizontal: 4,
            paddingVertical: 4,
        },
        buttonContainer: {
            display: 'flex',
            gap: 8,
            flexDirection: 'row',
        },
        optionButton: {
            flex: 1,
        },
    })

export default NostrSettings
