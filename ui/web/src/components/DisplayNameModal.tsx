import { Trans, useTranslation } from 'react-i18next'

import ProfileIcon from '@fedi/common/assets/svgs/profile.svg'
import { theme } from '@fedi/common/constants/theme'
import { useNuxStep } from '@fedi/common/hooks/nux'
import { selectMatrixAuth, selectOnboardingMethod } from '@fedi/common/redux'

import { useAppSelector } from '../hooks'
import { styled } from '../styles'
import { Icon } from './Icon'
import { Modal } from './Modal'
import { Text } from './Text'

export const DisplayNameModal = () => {
    const { t } = useTranslation()

    const matrixAuth = useAppSelector(selectMatrixAuth)
    const [hasSeenDisplayName, completeSeenDisplayName] =
        useNuxStep('displayNameModal')

    const onboardingMethod = useAppSelector(selectOnboardingMethod)
    const isNewSeedUser = onboardingMethod !== 'restored'
    const open =
        isNewSeedUser && !hasSeenDisplayName && !!matrixAuth?.displayName

    return (
        <Modal
            open={open}
            onClick={completeSeenDisplayName}
            title={t('feature.home.display-name')}
            description={matrixAuth?.displayName}>
            <ModalContent aria-label="test">
                <ModalIconWrapper>
                    <Icon icon={ProfileIcon} size="xl" />
                </ModalIconWrapper>
                <ModalTextWrapper>
                    <Text variant="h2">{t('feature.home.display-name')}</Text>
                    <Text variant="h2">
                        &quot;{matrixAuth?.displayName}&quot;
                    </Text>
                </ModalTextWrapper>
                <ModalTextWithIcon
                    variant="body"
                    css={{ color: theme.colors.darkGrey }}>
                    <Trans
                        i18nKey="feature.home.profile-change-icon"
                        components={{
                            icon: <ModalIcon icon={ProfileIcon} />,
                        }}
                    />
                </ModalTextWithIcon>
            </ModalContent>
        </Modal>
    )
}

const ModalContent = styled('div', {
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
})

const ModalTextWrapper = styled('div', {
    marginBottom: 10,
})

const ModalTextWithIcon = styled(Text, {
    alignItems: 'center',
    display: 'flex',
})

const ModalIcon = styled(Icon, {
    margin: '0 3px',
    width: 20,
})

const ModalIconWrapper = styled('div', {
    alignItems: 'center',
    borderRadius: '50%',
    boxSizing: 'border-box',
    display: 'flex',
    height: 50,
    holoGradient: '600',
    justifyContent: 'center',
    marginBottom: 10,
    padding: 5,
    overflow: 'hidden',
    width: 50,
})
