import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { selectNostrNpub, selectNostrNsec } from '@fedi/common/redux'

import { CopyButton } from '../components/ui/CopyButton'
import Flex from '../components/ui/Flex'
import HoloLoader from '../components/ui/HoloLoader'
import { PressableIcon } from '../components/ui/PressableIcon'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import { useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'NostrSettings'>

const NostrSettings: React.FC<Props> = (_: Props) => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    const nostrPublic = useAppSelector(selectNostrNpub)
    const nostrSecret = useAppSelector(selectNostrNsec)
    const [showNsec, setShowNsec] = useState(false)

    const style = styles(theme)

    return (
        <SafeAreaContainer style={style.container} edges="notop">
            <Flex gap="xs">
                <Flex row align="center" justify="between" gap="sm">
                    <Text medium>{t('feature.nostr.nostr-public-key')}</Text>
                    {nostrPublic && <CopyButton value={nostrPublic.npub} />}
                </Flex>
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
            </Flex>
            <Flex gap="xs">
                <Flex row align="center" justify="between" gap="sm">
                    <Text medium>{t('feature.nostr.nostr-secret-key')}</Text>
                    {nostrSecret && (
                        <Flex grow row justify="between">
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
                        </Flex>
                    )}
                </Flex>
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
            </Flex>
        </SafeAreaContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            width: '100%',
            gap: theme.spacing.lg,
        },
        pressableIcon: {
            width: 'auto',
            flexGrow: 0,
            flexShrink: 0,
            paddingHorizontal: 4,
            paddingVertical: 4,
        },
    })

export default NostrSettings
