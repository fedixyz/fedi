import { Text, Theme, useTheme } from '@rneui/themed'
import { StyleSheet } from 'react-native'

import { Community } from '@fedi/common/types'
import { shouldShowInviteCode } from '@fedi/common/utils/FederationUtils'

import Flex from '../../ui/Flex'
import { Pressable } from '../../ui/Pressable'
import { PressableIcon } from '../../ui/PressableIcon'
import { FederationLogo } from '../federations/FederationLogo'

type CommunityTileProps = {
    community: Community
    onSelect?: () => void
    onSelectQr?: () => void
    showQr?: boolean
}

const CommunityTile = ({
    community,
    onSelect = () => null,
    onSelectQr = () => null,
}: CommunityTileProps) => {
    const { theme } = useTheme()

    const showInviteCode = shouldShowInviteCode(community.meta)

    const style = styles(theme)
    return (
        <Pressable
            accessible={false}
            containerStyle={style.container}
            onPress={onSelect}>
            <Flex row align="center" justify="start" gap="md" shrink>
                <FederationLogo federation={community} size={48} />
                <Flex shrink align="start">
                    <Text style={style.title} bold numberOfLines={1}>
                        {community.name}
                    </Text>
                </Flex>
            </Flex>
            {showInviteCode && (
                <PressableIcon
                    testID={community.name
                        .concat('QRCodeButton')
                        .replaceAll(' ', '')}
                    hitSlop={10}
                    containerStyle={style.qr}
                    onPress={onSelectQr}
                    svgName="Qr"
                />
            )}
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            justifyContent: 'space-between',
            borderRadius: 0,
            paddingHorizontal: theme.spacing.lg,
            alignItems: 'center',
            flexDirection: 'row',
            gap: theme.spacing.lg,
        },
        title: {
            letterSpacing: -0.16,
            lineHeight: 20,
        },
        qr: {
            paddingHorizontal: 0,
            paddingVertical: 0,
            flexShrink: 0,
        },
    })

export default CommunityTile
