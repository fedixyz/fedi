import { DrawerNavigationProp } from '@react-navigation/drawer'
import {
    LinkingOptions,
    NavigatorScreenParams,
    RouteProp,
} from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'

import {
    ChatType,
    FederationPreview,
    ParsedBip21,
    ParsedBitcoinAddress,
    ParsedBolt11,
    ParsedCashuEcash,
    ParsedLnurlPay,
    ParsedLnurlWithdraw,
    ReceiveSuccessStatus,
    ReceiveSuccessData,
    Sats,
    MatrixEvent,
    UsdCents,
} from '@fedi/common/types'
import { MatrixEventContentType } from '@fedi/common/utils/matrix'

import { MSats } from '.'

// This type declaration allows all instances of useNavigation
// to be aware of type-safety from RootStackParamsList
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace ReactNavigation {
        // eslint-disable-next-line @typescript-eslint/no-empty-interface
        interface RootParamList extends RootStackParamList {}
    }
}

export const DRAWER_NAVIGATION_ID = 'ConnectedFederationsDrawer'
export const MAIN_NAVIGATOR_ID = 'MainStackNavigator'
export const TABS_NAVIGATOR_ID = 'TabsNavigator'

export type RouteHook = RouteProp<RootStackParamList>
export type DrawerNavigationHook =
    DrawerNavigationProp<MainNavigatorDrawerParamList>
export type NavigationHook = NativeStackNavigationProp<RootStackParamList>
export type NavigationLinkingConfig = LinkingOptions<
    RootStackParamList | MainNavigatorDrawerParamList
>
export type MainNavigatorDrawerParamList = {
    MainNavigator: NavigatorScreenParams<RootStackParamList>
    SwitchingFederations: { federationId: string | null }
}
export type TabsNavigatorParamList = {
    Chat: undefined
    Home: { offline: boolean }
    Mods: undefined
    OmniScanner: undefined
}
export type RootStackParamList = {
    AddFediMod: undefined
    BitcoinRequest: { uri: string }
    BugReportSuccess: undefined
    CameraPermission: { nextScreen: keyof RootStackParamList } | undefined
    ChatImageViewer: { uri: string }
    ChatRoomConversation: { roomId: string; chatType?: ChatType }
    ChatSettings: { title?: string }
    ChatRoomMembers: { roomId: string }
    ChatRoomInvite: { roomId: string }
    ChatUserConversation: { userId: string; displayName: string }
    ChatVideoViewer: { uri: string }
    ChatWallet: { recipientId: string }
    ChooseBackupMethod: undefined
    ChooseRecoveryMethod: undefined
    MigratedDevice: undefined
    MigratedDeviceSuccess: undefined
    CreatePoll: { roomId: string }
    EditPoll: { event: MatrixEvent<MatrixEventContentType<'m.poll'>> }
    FederationCurrency: { federationId: string }
    GlobalCurrency: undefined
    CompleteRecoveryAssist: { videoPath: string; recoveryId: string }
    CompleteSocialBackup: undefined
    CompleteSocialRecovery: undefined
    ConfirmJoinPublicGroup: { groupId: string }
    ConfirmSendEcash: { amount: Sats; notes?: string }
    ConfirmSendChatPayment: {
        amount: Sats
        roomId: string
        notes?: string
    }
    ConfirmRecoveryAssist: undefined
    ConfirmReceiveOffline: { ecash: string; notes?: string }
    ConfirmReceiveCashu: { parsedData: ParsedCashuEcash; notes?: string }
    ConfirmSendLightning: {
        parsedData: ParsedBolt11 | ParsedLnurlPay
        notes?: string
    }
    ConfirmSendOnChain: { parsedData: ParsedBip21; notes?: string }
    ConnectedFederationsDrawer: undefined
    CreateGroup: { defaultGroup?: boolean }
    EcashSendCancelled: undefined
    EnterDisplayName: undefined
    DirectChat: { memberId: string }
    EditGroup: { roomId: string }
    EditProfileSettings: undefined
    Eula: undefined
    FederationDetails: { federationId: string }
    FederationModSettings: { type?: string; federationId?: string }
    FederationInvite: { inviteLink: string }
    FederationGreeting: undefined
    FederationAcceptTerms: { federation: FederationPreview }
    FediModSettings: { type?: string; federationId?: string }
    HelpCentre: undefined
    Initializing: undefined
    JoinFederation: { invite?: string }
    LanguageSettings: undefined
    NewMessage: undefined
    NostrSettings: undefined
    NotificationsPermission:
        | { nextScreen: keyof RootStackParamList }
        | undefined
    PersonalRecovery: undefined
    PersonalRecoverySuccess: undefined
    PopupFederationEnded: undefined
    PublicFederations: undefined
    LocateSocialRecovery: undefined
    Receive: undefined
    ReceiveLightning: { parsedData?: ParsedLnurlWithdraw } | undefined
    ReceiveSuccess: {
        tx: ReceiveSuccessData
        status?: ReceiveSuccessStatus
    }
    ReceiveOffline: undefined
    RecoveryWords:
        | {
              nextScreenParams: NavigationArgs
          }
        | undefined
    RecoveryAssistSuccess: undefined
    RecoveryWalletOptions: undefined
    RecoveryWalletTransfer: undefined
    RecoveryNewWallet: undefined
    RecoveryDeviceSelection: undefined
    LegacyChat: undefined
    LockedDevice: undefined
    RecordBackupVideo: undefined
    GroupChat: { groupId: string }
    RoomSettings: { roomId: string }
    GroupInvite: { groupId: string }
    RecoverFromNonceReuse: undefined
    ScanMemberCode: { inviteToRoomId?: string } | undefined
    ScanSocialRecoveryCode: undefined
    SelectRecoveryFileSuccess: { fileName: string }
    SelectRecoveryFileFailure: { fileName: string }
    Send: undefined
    SendOfflineAmount: undefined
    SendOfflineQr: { ecash: string; amount: MSats }
    SendOnChainAmount: { parsedData: ParsedBip21 | ParsedBitcoinAddress }
    SendSuccess: { amount: MSats; unit: string }
    Settings: undefined
    ShareLogs: { ticketNumber: string } | undefined
    FediModBrowser: { url: string }
    Splash: undefined
    StabilityConfirmDeposit: { amount: Sats }
    StabilityConfirmWithdraw: { amountSats: Sats; amountCents: UsdCents }
    StabilityDeposit: undefined
    StabilityDepositInitiated: { amount: Sats }
    StabilityHistory: undefined
    StabilityHome: undefined
    StabilityWithdraw: undefined
    StabilityWithdrawInitiated: { formattedFiat: string }
    StableBalanceIntro: undefined
    StartPersonalBackup: undefined
    StartRecoveryAssist: undefined
    StartSocialBackup: undefined
    SocialBackupCloudUpload: undefined
    SocialBackupProcessing: { videoFilePath: string }
    SocialBackupSuccess: undefined
    SocialRecoveryQrModal: undefined
    SocialRecoverySuccess: undefined
    SocialRecoveryFailure: undefined
    TabsNavigator:
        | { initialRouteName: keyof TabsNavigatorParamList }
        | undefined
    Transactions: undefined
    UploadAvatarImage: undefined
    DeveloperSettings: undefined
    SetPin: undefined
    CreatedPin: undefined
    CreatePinInstructions: undefined
    PinAccess: undefined
    LockScreen:
        | {
              routeParams: NavigationArgs
          }
        | undefined
    FeatureLockScreen: undefined
    ResetPinStart: undefined
    ResetPin: undefined
}

export type NavigationArgs<
    T extends keyof RootStackParamList = keyof RootStackParamList,
> = [
    ...(T extends unknown
        ? undefined extends RootStackParamList[T]
            ? [screen: T] | [screen: T, params: RootStackParamList[T]]
            : [screen: T, params: RootStackParamList[T]]
        : never),
]
