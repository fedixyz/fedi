import { Text, Theme, useTheme } from '@rneui/themed'
import { StyleSheet, View } from 'react-native'

import { useAmountFormatter } from '@fedi/common/hooks/amount'
import { shouldShowInviteCode } from '@fedi/common/utils/FederationUtils'

import { FederationListItem, MSats } from '../../../types'
import { Pressable } from '../../ui/Pressable'
import { PressableIcon } from '../../ui/PressableIcon'
import { FederationLogo } from '../federations/FederationLogo'

type CommunityTileProps = {
    community: FederationListItem
    onSelect?: () => void
    onSelectQr?: () => void
    showQr?: boolean
    isActiveCommunity?: boolean
}

const CommunityTile = ({
    community,
    onSelect = () => null,
    onSelectQr = () => null,
    isActiveCommunity = false,
}: CommunityTileProps) => {
    const { theme } = useTheme()
    const { makeFormattedAmountsFromMSats } = useAmountFormatter()

    const { formattedSecondaryAmount, formattedPrimaryAmount } =
        makeFormattedAmountsFromMSats(
            community.hasWallet ? community.balance : (0 as MSats),
        )

    const showInviteCode = shouldShowInviteCode(community.meta)

    const style = styles(theme)
    return (
        <Pressable
            containerStyle={[
                style.container,
                isActiveCommunity && style.active,
            ]}
            onPress={onSelect}>
            <View style={style.content}>
                <FederationLogo federation={community} size={48} />
                <View style={style.titleContainer}>
                    <Text style={style.title} bold numberOfLines={1}>
                        {community.name}
                    </Text>
                    {community.hasWallet && (
                        <View style={style.balanceContainer}>
                            <Text
                                style={style.balance}
                                caption
                                numberOfLines={1}
                                adjustsFontSizeToFit>
                                {`${formattedPrimaryAmount} (${formattedSecondaryAmount})`}
                            </Text>
                        </View>
                    )}
                </View>
            </View>
            {showInviteCode && (
                <PressableIcon
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
            paddingVertical: theme.spacing.lg,
            alignItems: 'center',
            flexDirection: 'row',
            gap: theme.spacing.lg,
        },
        content: {
            gap: theme.spacing.md,
            justifyContent: 'flex-start',
            flexDirection: 'row',
            alignItems: 'center',
            flexShrink: 1,
        },
        titleContainer: {
            flexDirection: 'column',
            alignItems: 'flex-start',
            flexShrink: 1,
        },
        title: {
            letterSpacing: -0.16,
            lineHeight: 20,
        },
        balance: {
            fontSize: theme.sizes.xxs,
            letterSpacing: -0.14,
            lineHeight: 20,
        },
        balanceContainer: {
            flexDirection: 'row',
            gap: theme.spacing.xs,
        },
        qr: {
            paddingHorizontal: 0,
            paddingVertical: 0,
            flexShrink: 0,
        },
        active: {
            backgroundColor: theme.colors.ghost,
        },
    })

export default CommunityTile
