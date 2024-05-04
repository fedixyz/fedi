import * as RadixLabel from '@radix-ui/react-label'
import { styled } from '@stitches/react'
import { useRouter } from 'next/router'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { v4 as uuidv4 } from 'uuid'

import Info from '@fedi/common/assets/svgs/info.svg'
import { useToast } from '@fedi/common/hooks/toast'
import {
    selectActiveFederation,
    selectAuthenticatedMember,
} from '@fedi/common/redux'
import {
    submitBugReport,
    uploadBugReportLogs,
} from '@fedi/common/utils/bug-report'
import { formatErrorMessage } from '@fedi/common/utils/format'
import { makeLog, exportLogs } from '@fedi/common/utils/log'
import { makeTarGz } from '@fedi/common/utils/targz'

import { useAppSelector, useAutosizeTextArea } from '../../hooks'
import { theme } from '../../styles'
import { Button } from '../Button'
import { Dialog } from '../Dialog'
import { DialogStatus } from '../DialogStatus'
import { Icon } from '../Icon'
import { Input } from '../Input'
import { Switch } from '../Switch'
import { Text } from '../Text'
import { FileData, FileUploader } from './FileUploader'

type Status =
    | 'idle'
    | 'generating-data'
    | 'uploading-data'
    | 'submitting-report'

const log = makeLog('BugReport')

export default function BugReport() {
    const [completedModal, setCompletedModal] = useState(false)
    const [description, setDescription] = useState('')
    const [sendInfo, setSendInfo] = useState(false)
    const [status, setStatus] = useState<Status>('idle')
    const [email, setEmail] = useState('')
    const [files, setFiles] = useState<Array<FileData>>([])

    const authenticatedMember = useAppSelector(selectAuthenticatedMember)
    const activeFederation = useAppSelector(selectActiveFederation)
    const textAreaRef = useRef<HTMLTextAreaElement>(null)

    const { t } = useTranslation()

    const router = useRouter()
    const toast = useToast()

    const isSubmitDisabled = status !== 'idle'
    const submitText =
        status === 'generating-data'
            ? t('feature.bug.submit-generating-data')
            : status === 'uploading-data'
            ? t('feature.bug.submit-uploading-data')
            : status === 'submitting-report'
            ? t('feature.bug.submit-submitting-report')
            : t('words.submit')

    const redirectToHome = () => {
        router.push('/')
    }

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        try {
            const id = uuidv4()

            setStatus('generating-data')

            const jsLogs = await exportLogs()

            const gzip = await makeTarGz([
                {
                    name: 'app.log',
                    content: jsLogs,
                },
                {
                    name: 'device.json',
                    content: JSON.stringify({
                        userAgent: window.navigator.userAgent,
                        preferredLanguage: window.navigator.language,
                        supportedLanguages: window.navigator.languages,
                        screen: `${window.screen.width}x${window.screen.height}`,
                        window: `${window.innerWidth}x${window.innerHeight}`,
                    }),
                },
                ...files.map(f => ({
                    name: f.fileName,
                    content: Buffer.from(f.base64, 'base64'),
                })),
            ])

            setStatus('uploading-data')

            await uploadBugReportLogs(id, gzip)

            setStatus('submitting-report')

            await submitBugReport({
                id,
                description,
                email,
                federationName: sendInfo
                    ? activeFederation?.name || activeFederation?.id
                    : undefined,
                username: sendInfo ? authenticatedMember?.username : undefined,
                version:
                    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(
                        0,
                        6,
                    ) || 'unknown',
                platform: 'PWA (web)',
            })
            setCompletedModal(true)

            setTimeout(() => {
                redirectToHome()
            }, 2500)
        } catch (err) {
            log.error('Failed to submit bug report', err)
            toast.error(t, err, formatErrorMessage(t, err, 'errors.unknown-error'))
            setStatus('idle')
        }
    }

    useAutosizeTextArea(textAreaRef.current, description)

    return (
        <Form onSubmit={handleSubmit}>
            <DescriptionContainer>
                <DescriptionLabel variant="caption" weight="medium">
                    {t('feature.bug.description-label')}
                </DescriptionLabel>
                <DescriptionTextarea
                    placeholder={t('feature.bug.description-placeholder')}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    ref={textAreaRef}
                    rows={3}
                    name="description"
                    required
                />
            </DescriptionContainer>
            <SendFederationNotice>
                <SendFederationNoticeLabel variant="caption" weight="medium">
                    {t('feature.bug.info-label')}
                </SendFederationNoticeLabel>
                <Switch
                    checked={sendInfo}
                    onCheckedChange={setSendInfo}
                    name="sendInfo"
                />
            </SendFederationNotice>
            <Input
                label={
                    <Text variant="caption" weight="medium">
                        {t('feature.bug.email-label')}
                    </Text>
                }
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={t('phrases.email-address')}
                name="email"
                type="email"
                id="email"
            />
            <Text variant="caption" weight="medium">
                {t('feature.bug.screenshot-label')}
            </Text>
            <FileUploader files={files} setFiles={setFiles} />
            <DisclaimerBanner>
                <Icon icon={Info} />
                <Text variant="caption" weight="medium">
                    {t('feature.bug.log-disclaimer')}
                </Text>
            </DisclaimerBanner>
            <SubmitContainer>
                <Button disabled={isSubmitDisabled}>{submitText}</Button>
            </SubmitContainer>
            <Dialog open={completedModal} onOpenChange={redirectToHome}>
                <DialogSpacer />
                <DialogStatus
                    status={completedModal ? 'success' : 'loading'}
                    title={t('feature.bug.success-title')}
                    description={t('feature.bug.success-subtitle')}
                />
            </Dialog>
        </Form>
    )
}

const Form = styled('form', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: theme.space.lg,
    width: '100%',
})

const DescriptionContainer = styled(RadixLabel.Label, {
    display: 'inline-flex',
    flexDirection: 'column',
    textAlign: 'left',
    width: '100%',
})

const DescriptionLabel = styled(Text, {
    paddingBottom: 4,
    paddingLeft: 8,
})

const DescriptionTextarea = styled('textarea', {
    padding: 12,
    border: `2px solid ${theme.colors.lightGrey}`,
    borderRadius: 8,
    outline: 'none',
    textOverflow: 'clip',
    background: theme.colors.white,
    transition: 'border-color 80ms ease',
    width: '100%',
    resize: 'vertical',
    minHeight: 120,

    '&:disabled': {
        cursor: 'not-allowed',
    },
    '&::placeholder': {
        color: theme.colors.grey,
    },
    '&:focus': {
        borderColor: theme.colors.black,
    },
})

const SendFederationNotice = styled('div', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.space.md,
    gap: theme.space.xl,
    backgroundColor: theme.colors.offWhite,
    borderRadius: 8,
})

const SendFederationNoticeLabel = styled(Text, {
    flex: 1,
    minWidth: 0,
    lineHeight: 20,
})

const DisclaimerBanner = styled('div', {
    background: theme.colors.offWhite,
    padding: theme.space.md,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    gap: theme.space.md,
})

const SubmitContainer = styled('div', {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
})

/**
 * The <Dialog/> Component does not allow setting arbitraty style attributes.
 * To ensure it has a mininum height of 360px such that you can see the full success status, we use this spacer.
 */
const DialogSpacer = styled('div', {
    minHeight: 360,
})
