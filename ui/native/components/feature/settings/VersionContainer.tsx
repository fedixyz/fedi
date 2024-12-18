import { useToast } from '@fedi/common/hooks/toast'
import {
    selectFedimintVersion,
    setDeveloperMode,
} from '@fedi/common/redux/environment'
import { Text, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'
import { version } from '../../../package.json'
import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import SvgImage from '../../ui/SvgImage'

type VersionContainerProps = {
    unlockDevModeCount: number
    setUnlockDevModeCount: (count: number) => void
    developerMode: boolean
}

export const VersionContainer = ({
    unlockDevModeCount,
    setUnlockDevModeCount,
    developerMode,
}: VersionContainerProps) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const toast = useToast()
    const dispatch = useAppDispatch()
    const style = styles(theme)
    const fedimintVersion = useAppSelector(selectFedimintVersion)

    return (
        <View style={style.versionContainer}>
            <SvgImage name="FediLogoIcon" containerStyle={style.logo} />
            <Pressable
                onPress={() => {
                    setUnlockDevModeCount(unlockDevModeCount + 1)
                    if (unlockDevModeCount > 21) {
                        if (developerMode) {
                            toast.show(
                                t(
                                    'feature.developer.developer-mode-deactivated',
                                ),
                            )
                            dispatch(setDeveloperMode(false))
                        } else {
                            toast.show(
                                t('feature.developer.developer-mode-activated'),
                            )
                            dispatch(setDeveloperMode(true))
                        }
                    }
                }}>
                <Text adjustsFontSizeToFit numberOfLines={1}>
                    {t('phrases.app-version', { version })}
                </Text>
                {fedimintVersion && (
                    <Text adjustsFontSizeToFit numberOfLines={1}>
                        {t('phrases.fedimint-version', {
                            version: fedimintVersion,
                        })}
                    </Text>
                )}
            </Pressable>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        versionContainer: {
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.offWhite100,
            padding: theme.spacing.md,
            borderRadius: theme.borders.defaultRadius,
            marginVertical: theme.spacing.xl,
        },
        logo: {
            marginBottom: theme.spacing.sm,
        },
    })
