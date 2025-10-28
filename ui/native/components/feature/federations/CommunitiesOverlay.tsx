import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import {
    selectCommunities,
    setLastSelectedCommunityId,
} from '@fedi/common/redux'
import { Community } from '@fedi/common/types'

import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { NavigationHook } from '../../../types/navigation'
import CustomOverlay from '../../ui/CustomOverlay'
import Flex from '../../ui/Flex'
import CommunityTile from './CommunityTile'

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export const CommunitiesOverlay: React.FC<Props> = ({ onOpenChange, open }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()
    const dispatch = useAppDispatch()
    const communities = useAppSelector(selectCommunities)

    const style = styles(theme)

    const handleTilePress = (c: Community) => {
        dispatch(setLastSelectedCommunityId(c.id))
        onOpenChange(false)
    }

    const handleQrPress = (c: Community) => {
        //close overlay first so it doesn't crash
        handleDismiss()
        navigation.navigate('CommunityInvite', {
            inviteLink: c.inviteCode,
        })
    }

    const handleDismiss = () => {
        onOpenChange(false)
    }

    return (
        <CustomOverlay
            show={open}
            noHeaderPadding
            onBackdropPress={handleDismiss}
            contents={{
                body: (
                    <Flex grow shrink>
                        <View style={style.topTextContainer}>
                            <Text
                                h2
                                medium
                                numberOfLines={1}
                                adjustsFontSizeToFit>
                                {`${t('words.communities')}`}
                            </Text>
                            {communities.length === 0 && (
                                <Text style={style.drawerSubtitle}>
                                    {t('feature.federations.drawer-subtitle')}
                                </Text>
                            )}
                        </View>
                        <View style={style.communitiesList}>
                            {communities.map((c, i) => {
                                return (
                                    <CommunityTile
                                        key={`dis-${i}`}
                                        community={c}
                                        onSelect={() => handleTilePress(c)}
                                        onSelectQr={() => handleQrPress(c)}
                                    />
                                )
                            })}
                        </View>
                    </Flex>
                ),
            }}
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        communitiesList: {
            padding: 0,
            marginTop: 10,
        },
        topTextContainer: {
            left: 3,
            padding: theme.spacing.lg,
            paddingBottom: theme.spacing.xxs,
            gap: 10,
        },
        drawerSubtitle: {
            fontSize: 14,
            color: theme.colors.darkGrey,
            textAlign: 'left',
            margin: 0,
            padding: 0,
            paddingBottom: theme.spacing.lg + 2,
        },
    })

export default CommunitiesOverlay
