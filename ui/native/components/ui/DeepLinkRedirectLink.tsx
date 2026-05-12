import { Theme, useTheme, Text } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Linking } from 'react-native'

import { getDeeplinkResumeUrl } from '@fedi/common/constants/api'
import {
    selectCommunityIds,
    selectGlobalCommunityInvite,
    selectLoadedFederations,
} from '@fedi/common/redux'

import { useAppSelector } from '../../state/hooks'
import { Row, Column } from './Flex'
import { OrDivider } from './OrDivider'

export const DeepLinkRedirectLink: React.FC = () => {
    const { theme } = useTheme()
    const style = styles(theme)
    const { t } = useTranslation()
    const communityIds = useAppSelector(selectCommunityIds)
    const federations = useAppSelector(selectLoadedFederations)
    const globalCommunityInvite = useAppSelector(selectGlobalCommunityInvite)
    const userCommunityIds = communityIds.filter(
        id => id !== globalCommunityInvite,
    )

    if (federations.length > 0 || userCommunityIds.length > 0) return null

    const redirectToDeeplinkProcessingPage = () => {
        Linking.openURL(getDeeplinkResumeUrl())
    }

    return (
        <Column>
            <OrDivider />

            <Row
                gap="xs"
                align="center"
                justify="evenly"
                style={style.textContainer}>
                <Text style={style.helpText}>
                    {t('feature.onboarding.deeplink-redirect-prompt')}{' '}
                    <Text
                        style={style.linkText}
                        accessibilityRole="link"
                        onPress={redirectToDeeplinkProcessingPage}>
                        {t('feature.onboarding.deeplink-redirect-cta')}
                    </Text>
                </Text>
            </Row>
        </Column>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        textContainer: {
            marginVertical: theme.spacing.xs,
        },
        text: {
            fontSize: 14,
            fontWeight: '400',
            color: theme.colors.grey,
        },
        helpText: {
            fontSize: 16,
            lineHeight: 16,
            fontWeight: '400',
            color: theme.colors.darkGrey,
        },
        linkText: {
            fontSize: 16,
            color: theme.colors.darkGrey,
            textDecorationLine: 'underline',
        },
    })
