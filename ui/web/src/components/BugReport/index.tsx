// import { makeLog } from '@fedi/common/utils/log'

// type Status =
//     | 'idle'
//     | 'generating-data'
//     | 'uploading-data'
//     | 'submitting-report'

// const log = makeLog('BugReport')

export default function BugReport() {
    // const [completedModal, setCompletedModal] = useState(false)
    // const [description, setDescription] = useState('')
    // const [sendInfo, setSendInfo] = useState(false)
    // const [status, setStatus] = useState<Status>('idle')
    // const [email, setEmail] = useState('')
    // const [files, setFiles] = useState<Array<FileData>>([])
    // const [dbTaps, setDbTaps] = useState(0)
    // const [sendDb, setShouldSendDb] = useState(false)

    // const activeFederation = useAppSelector(selectActiveFederation)
    // const textAreaRef = useRef<HTMLTextAreaElement>(null)

    // const { t } = useTranslation()

    // const router = useRouter()
    // const toast = useToast()

    // const isSubmitDisabled = status !== 'idle'
    // const submitText =
    //     status === 'generating-data'
    //         ? t('feature.bug.submit-generating-data')
    //         : status === 'uploading-data'
    //           ? t('feature.bug.submit-uploading-data')
    //           : status === 'submitting-report'
    //             ? t('feature.bug.submit-submitting-report')
    //             : t('words.submit')

    // const redirectToHome = () => {
    //     router.push('/')
    // }

    // const handleBugClick = () => {
    //     const taps = dbTaps + 1
    //     setDbTaps(taps)

    //     if (taps > 21) {
    //         setShouldSendDb(!sendDb)
    //     }
    // }

    // const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    //     e.preventDefault()
    //     try {
    //         const id = uuidv4()

    //         setStatus('generating-data')

    //         const jsLogs = await exportLogs()

    //         const attachmentFiles = [
    //             {
    //                 name: 'app.log',
    //                 content: jsLogs,
    //             },
    //             {
    //                 name: 'device.json',
    //                 content: JSON.stringify({
    //                     userAgent: window.navigator.userAgent,
    //                     preferredLanguage: window.navigator.language,
    //                     supportedLanguages: window.navigator.languages,
    //                     screen: `${window.screen.width}x${window.screen.height}`,
    //                     window: `${window.innerWidth}x${window.innerHeight}`,
    //                 }),
    //             },
    //             ...files.map(f => ({
    //                 name: f.fileName,
    //                 content: Buffer.from(f.base64, 'base64'),
    //             })),
    //         ]

    //         if (sendDb) {
    //             if (!activeFederation) {
    //                 log.warn(
    //                     'Cannot include DB dump, no active federation is selected',
    //                 )
    //             } else {
    //                 const dumpedDbPath = await fedimint.dumpDb({
    //                     federationId: activeFederation.id,
    //                 })
    //                 const content = await readBridgeFile(dumpedDbPath)

    //                 attachmentFiles.push({
    //                     name: 'db.dump',
    //                     content: Buffer.from(content).toString('base64'),
    //                 })
    //             }
    //         }

    //         const gzip = await makeTarGz(attachmentFiles)

    //         setStatus('uploading-data')

    //         await uploadBugReportLogs(id, gzip)

    //         setStatus('submitting-report')

    //         await submitBugReport({
    //             id,
    //             // TODO: Update this screen to match native
    //             // ref: https://github.com/fedibtc/fedi/issues/4936
    //             // ticketNumber: '...'

    //             // description,
    //             // email,
    //             // federationName: sendInfo
    //             //     ? activeFederation?.name || activeFederation?.id
    //             //     : undefined,
    //             // username: sendInfo ? matrixAuth?.userId : undefined,
    //             // version:
    //             //     process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(
    //             //         0,
    //             //         6,
    //             //     ) || 'unknown',
    //             // platform: 'PWA (web)',
    //         })
    //         setCompletedModal(true)

    //         setTimeout(() => {
    //             redirectToHome()
    //         }, 2500)
    //     } catch (err) {
    //         log.error('Failed to submit bug report', err)
    //         toast.error(t, 'errors.unknown-error')
    //         setStatus('idle')
    //     }
    // }

    // useAutosizeTextArea(textAreaRef.current, description)

    // ref: https://github.com/fedibtc/fedi/pull/5760/files/ae7b4d602d07d3a0bf03c32406457f27c2761a6e#r1878724676
    return null

    // return (
    //     <Form onSubmit={handleSubmit}>
    //         <DescriptionContainer>
    //             <DescriptionLabel variant="caption" weight="medium">
    //                 {t('feature.bug.description-label')}
    //             </DescriptionLabel>
    //             <DescriptionTextarea
    //                 placeholder={t('feature.bug.description-placeholder')}
    //                 value={description}
    //                 onChange={e => setDescription(e.target.value)}
    //                 ref={textAreaRef}
    //                 rows={3}
    //                 name="description"
    //                 required
    //             />
    //         </DescriptionContainer>
    //         <SendFederationNotice>
    //             <SendFederationNoticeLabel variant="caption" weight="medium">
    //                 {t('feature.bug.info-label')}
    //             </SendFederationNoticeLabel>
    //             <Switch
    //                 checked={sendInfo}
    //                 onCheckedChange={setSendInfo}
    //                 name="sendInfo"
    //             />
    //         </SendFederationNotice>
    //         <Input
    //             label={
    //                 <Text variant="caption" weight="medium">
    //                     {t('feature.bug.email-label')}
    //                 </Text>
    //             }
    //             value={email}
    //             onChange={e => setEmail(e.target.value)}
    //             placeholder={t('phrases.email-address')}
    //             name="email"
    //             type="email"
    //             id="email"
    //         />
    //         <Text variant="caption" weight="medium">
    //             {t('feature.bug.screenshot-label')}
    //         </Text>
    //         <FileUploader files={files} setFiles={setFiles} />
    //         <DisclaimerBanner>
    //             {activeFederation && (
    //                 <BugIcon onClick={handleBugClick}>🪲</BugIcon>
    //             )}
    //             <Text variant="caption" weight="medium">
    //                 {t('feature.bug.log-disclaimer')}
    //             </Text>
    //         </DisclaimerBanner>
    //         {sendDb && (
    //             <AttachedIndicator>
    //                 <Text weight="medium" variant="caption">
    //                     {t('feature.bug.database-attached')} 🕷️🐞🦟
    //                 </Text>
    //                 <Icon icon={CheckIcon} />
    //             </AttachedIndicator>
    //         )}
    //         <SubmitContainer>
    //             <Button disabled={isSubmitDisabled}>{submitText}</Button>
    //         </SubmitContainer>
    //         <Dialog open={completedModal} onOpenChange={redirectToHome}>
    //             <DialogSpacer />
    //             <DialogStatus
    //                 status={completedModal ? 'success' : 'loading'}
    //                 title={t('feature.bug.success-title')}
    //                 description={t('feature.bug.success-subtitle')}
    //             />
    //         </Dialog>
    //     </Form>
    // )
}

// const BugIcon = styled('div', {
//     userSelect: 'none',
//     fontSize: 24,
//     cursor: 'default',
// })

// const AttachedIndicator = styled('div', {
//     background: theme.colors.offWhite,
//     borderRadius: 12,
//     padding: 12,
//     gap: 8,
//     display: 'flex',
//     justifyContent: 'space-between',
//     alignItems: 'center',
// })

// const Form = styled('form', {
//     flex: 1,
//     display: 'flex',
//     flexDirection: 'column',
//     gap: theme.space.lg,
//     width: '100%',
// })

// const DescriptionContainer = styled(RadixLabel.Label, {
//     display: 'inline-flex',
//     flexDirection: 'column',
//     textAlign: 'left',
//     width: '100%',
// })

// const DescriptionLabel = styled(Text, {
//     paddingBottom: 4,
//     paddingLeft: 8,
// })

// const DescriptionTextarea = styled('textarea', {
//     padding: 12,
//     border: `2px solid ${theme.colors.lightGrey}`,
//     borderRadius: 8,
//     outline: 'none',
//     textOverflow: 'clip',
//     background: theme.colors.white,
//     transition: 'border-color 80ms ease',
//     width: '100%',
//     resize: 'vertical',
//     minHeight: 120,

//     '&:disabled': {
//         cursor: 'not-allowed',
//     },
//     '&::placeholder': {
//         color: theme.colors.grey,
//     },
//     '&:focus': {
//         borderColor: theme.colors.black,
//     },
// })

// const SendFederationNotice = styled('div', {
//     display: 'flex',
//     alignItems: 'center',
//     justifyContent: 'space-between',
//     padding: theme.space.md,
//     gap: theme.space.xl,
//     backgroundColor: theme.colors.offWhite,
//     borderRadius: 8,
// })

// const SendFederationNoticeLabel = styled(Text, {
//     flex: 1,
//     minWidth: 0,
//     lineHeight: 20,
// })

// const DisclaimerBanner = styled('div', {
//     borderRadius: 8,
//     marginTop: 32,
//     display: 'flex',
//     flexDirection: 'column',
//     alignItems: 'center',
//     gap: theme.space.md,
//     textAlign: 'center',
//     color: theme.colors.grey,
// })

// const SubmitContainer = styled('div', {
//     display: 'flex',
//     justifyContent: 'flex-end',
//     alignItems: 'center',
// })

// /**
//  * The <Dialog/> Component does not allow setting arbitraty style attributes.
//  * To ensure it has a mininum height of 360px such that you can see the full success status, we use this spacer.
//  */
// const DialogSpacer = styled('div', {
//     minHeight: 360,
// })
