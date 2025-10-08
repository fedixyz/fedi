import { useTranslation } from 'react-i18next'

import FediLogo from '@fedi/common/assets/svgs/fedi-logo.svg'
import {
    ANDROID_PLAY_STORE_URL,
    IOS_APP_STORE_URL,
} from '@fedi/common/constants/linking'

import { useDeviceQuery } from '../../hooks'
import { styled, theme } from '../../styles'
import { Button } from '../Button'
import { Icon } from '../Icon'
import { Text } from '../Text'

export const MobileAppDownloadBanner: React.FC = () => {
    const { t } = useTranslation()
    const { isIOS } = useDeviceQuery()

    return (
        <Wrapper
            aria-label="Mobile App Download Banner"
            data-testid="mobile-app-download-banner">
            <TopRow>
                <Text weight="bolder" variant="body">
                    {t('feature.home.mobile-app-download-title')}
                </Text>
            </TopRow>
            <Content>
                <LogoWrapper>
                    <Icon icon={FediLogo} size={100} />
                </LogoWrapper>
                <TextWrapper>
                    <Text variant="caption">
                        {t('feature.home.mobile-app-download-description')}
                    </Text>
                </TextWrapper>
            </Content>
            <ButtonsWrapper>
                {isIOS ? (
                    <Button
                        size="md"
                        width="full"
                        data-testid="mobile-app-download-ios-button"
                        onClick={() =>
                            window.open(IOS_APP_STORE_URL, '_blank')
                        }>
                        {t('feature.home.mobile-app-download-ios')}
                    </Button>
                ) : (
                    <Button
                        size="md"
                        width="full"
                        data-testid="mobile-app-download-android-button"
                        onClick={() =>
                            window.open(ANDROID_PLAY_STORE_URL, '_blank')
                        }>
                        {t('feature.home.mobile-app-download-android')}
                    </Button>
                )}
            </ButtonsWrapper>
        </Wrapper>
    )
}

const Wrapper = styled('div', {
    borderRadius: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.lg,
    fediGradient: 'sky-banner',
})

const Content = styled('div', {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.lg,
})

const TextWrapper = styled('div', {
    flex: 2,
    textAlign: 'left',
})

const LogoWrapper = styled('div', {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
})

const TopRow = styled('div', {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    color: theme.colors.night,
    width: '100%',
})

const ButtonsWrapper = styled('div', {
    flex: 1,
    width: '100%',
    display: 'flex',
    flexDirection: 'row',
    gap: 12,
    '& > *': {
        // lets buttons shrink to avoid overflowing the container
        flexShrink: 1,
        minWidth: 0,
    },
})
