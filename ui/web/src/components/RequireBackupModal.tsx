import { useRouter } from 'next/router'
import { useTranslation } from 'react-i18next'

import WordListIcon from '@fedi/common/assets/svgs/word-list.svg'
import { theme } from '@fedi/common/constants/theme'
import { useNuxStep } from '@fedi/common/hooks/nux'
import { selectLastUsedFederation } from '@fedi/common/redux'

import { useAppSelector } from '../hooks'
import { styled } from '../styles'
import { Avatar } from './Avatar'
import { Modal } from './Modal'
import { Text } from './Text'

const BACKUP_REMINDER_MIN_BALANCE = 1000000 // 1000000 msats or 1000 sats

export const RequireBackupModal = () => {
    const { t } = useTranslation()
    const router = useRouter()

    const [hasPerformedPersonalBackup] = useNuxStep(
        'hasPerformedPersonalBackup',
    )

    const featuredFederation = useAppSelector(selectLastUsedFederation)
    const open =
        !!featuredFederation &&
        featuredFederation.balance > BACKUP_REMINDER_MIN_BALANCE &&
        !hasPerformedPersonalBackup

    return (
        <Modal
            open={open}
            onClick={() => router.push('/settings/backup/personal')}
            title={t('feature.home.backup-wallet-title')}
            description={t('feature.home.backup-wallet-description')}>
            <ModalContent aria-label="test">
                <ModalIconWrapper>
                    <Avatar
                        size="md"
                        id=""
                        name="list"
                        holo
                        icon={WordListIcon}
                        css={{ alignSelf: 'center' }}
                    />
                </ModalIconWrapper>
                <ModalTextWrapper>
                    <Text variant="h2">
                        {t('feature.home.backup-wallet-title')}
                    </Text>
                </ModalTextWrapper>
                <Text variant="body" css={{ color: theme.colors.darkGrey }}>
                    {t('feature.home.backup-wallet-description')}
                </Text>
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
