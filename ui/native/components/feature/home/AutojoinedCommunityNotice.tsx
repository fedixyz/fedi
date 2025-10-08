import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import { Trans, useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import {
    removeAutojoinNoticeToDisplay,
    selectAutojoinNoticeInfo,
    setLastSelectedCommunityId,
} from '@fedi/common/redux/federation'
import { Community, Federation } from '@fedi/common/types'
import { makeLog } from '@fedi/common/utils/log'

import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { navigateToHome } from '../../../state/navigation'
import GradientView from '../../ui/GradientView'
import { PressableIcon } from '../../ui/PressableIcon'

const log = makeLog('AutojoinedCommunityNotice')

type Props = {
    communityId?: Community['id']
    federationId?: Federation['id']
}

const AutojoinedCommunityNotice = ({ communityId, federationId }: Props) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const navigation = useNavigation()
    const style = styles(theme)

    const autoJoinNoticeInfo = useAppSelector(s =>
        selectAutojoinNoticeInfo(s, communityId, federationId),
    )
    if (!autoJoinNoticeInfo) return null
    const { federation, autojoinedCommunityId } = autoJoinNoticeInfo
    if (!federation || !autojoinedCommunityId) return null

    const goToFederation = () => {
        navigation.navigate('FederationDetails', {
            federationId: federation.id,
        })
    }
    const goToCommunity = () => {
        dispatch(setLastSelectedCommunityId(autojoinedCommunityId))
        navigation.dispatch(navigateToHome())
    }

    return (
        <GradientView variant="sky-banner" style={style.content}>
            <Text caption style={style.textContainer}>
                {communityId && (
                    <Trans
                        t={t}
                        i18nKey="feature.communities.autojoined-community-notice"
                        components={{
                            federationLink: (
                                <Text
                                    caption
                                    style={style.link}
                                    onPress={goToFederation}
                                />
                            ),
                        }}
                    />
                )}
                {federationId && (
                    <Trans
                        t={t}
                        i18nKey="feature.communities.autojoined-community-notice-federation"
                        components={{
                            communityLink: (
                                <Text
                                    caption
                                    style={style.link}
                                    onPress={goToCommunity}
                                />
                            ),
                        }}
                    />
                )}
            </Text>
            <PressableIcon
                svgName="Close"
                containerStyle={style.closeButton}
                onPress={() => {
                    log.info(
                        'dismissing autojoined community notice for',
                        autojoinedCommunityId,
                    )
                    dispatch(
                        removeAutojoinNoticeToDisplay({
                            communityId: autojoinedCommunityId,
                        }),
                    )
                }}
            />
        </GradientView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        content: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.md,
            paddingVertical: theme.spacing.lg,
            paddingHorizontal: theme.spacing.lg,
            borderRadius: theme.borders.defaultRadius,
        },
        link: {
            color: theme.colors.link,
        },
        textContainer: {
            flex: 1,
        },
        closeButton: {
            flex: 0,
        },
    })

export default AutojoinedCommunityNotice
