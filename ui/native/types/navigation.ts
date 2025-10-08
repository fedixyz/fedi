import {
    LinkingOptions,
    NavigatorScreenParams,
    RouteProp,
} from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'

import {
    ChatType,
    ParsedBip21,
    ParsedBitcoinAddress,
    ParsedBolt11,
    ParsedCashuEcash,
    ParsedLnurlPay,
    ParsedLnurlWithdraw,
    ReceiveSuccessStatus,
    ReceiveSuccessData,
    Sats,
    UsdCents,
    Federation,
    Community,
} from '@fedi/common/types'
import { RpcFederationPreview } from '@fedi/common/types/bindings'

import { MSats } from '.'

// This type declaration allows all instances of useNavigation
// to be aware of type-safety from RootStackParamsList
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace ReactNavigation {
        // eslint-disable-next-line @typescript-eslint/no-empty-object-type
        interface RootParamList extends RootStackParamList {}
    }
}

export const MAIN_NAVIGATOR_ID = 'MainStackNavigator'
export const TABS_NAVIGATOR_ID = 'TabsNavigator'

export type RouteHook = RouteProp<RootStackParamList>
export type NavigationHook = NativeStackNavigationProp<RootStackParamList>
export type MainNavigatorParamList = {
    MainNavigator: NavigatorScreenParams<RootStackParamList>
}
export type NavigationLinkingConfig = LinkingOptions<
    RootStackParamList | MainNavigatorParamList
>
export type TabsNavigatorParamList = {
    Chat: undefined
    Home: { offline: boolean }
    Mods: undefined
    Federations: undefined
}
export type RootStackParamList = {
    AppSettings: undefined
    AddFediMod: undefined
    BitcoinRequest: { invoice: string; federationId?: Federation['id'] }
    BugReportSuccess: undefined
    CameraPermission: { nextScreen: keyof RootStackParamList } | undefined
    ChatImageViewer: { uri: string }
    ChatsListSearch: { initialQuery?: string }
    ChatConversationSearch: { roomId: string; initialQuery?: string }
    ChatRoomConversation: {
        roomId: string
        chatType?: ChatType
        scrollToMessageId?: string
    }
    ChatSettings: { title?: string }
    ChatRoomMembers: { roomId: string; displayMultispendRoles?: boolean }
    ChatRoomInvite: { roomId: string }
    ChatUserConversation: { userId: string; displayName: string }
    ChatVideoViewer: { uri: string }
    ChatWallet: { recipientId: string }
    ChooseBackupMethod: undefined
    ChooseRecoveryMethod: undefined
    MigratedDevice: undefined
    MigratedDeviceSuccess: undefined
    CreatePoll: { roomId: string }
    FederationCurrency: { federationId: Federation['id'] }
    GlobalCurrency: undefined
    GroupMultispend: { roomId: string }
    MultispendConfirmDeposit: {
        roomId: string
        amount: UsdCents
        notes?: string
        federationId: Federation['id']
    }
    MultispendConfirmWithdraw: {
        roomId: string
        amount: UsdCents
        notes?: string
        federationId: Federation['id']
    }
    MultispendDeposit: { roomId: string }
    MultispendWithdraw: { roomId: string }
    CompleteRecoveryAssist: {
        videoPath: string
        recoveryId: string
        federationId: Federation['id']
    }
    CompleteSocialBackup: undefined
    CompleteSocialRecovery: undefined
    ConfirmJoinPublicGroup: { groupId: string }
    ConfirmSendEcash: { amount: Sats; notes?: string }
    ConfirmSendChatPayment: {
        amount: Sats
        roomId: string
        notes?: string
    }
    ConfirmRecoveryAssist: { federationId: Federation['id'] }
    ConfirmReceiveOffline: { ecash: string; notes?: string }
    ConfirmReceiveCashu: { parsedData: ParsedCashuEcash; notes?: string }
    ConfirmSendLightning: {
        parsedData: ParsedBolt11 | ParsedLnurlPay
        notes?: string
    }
    ConfirmSendOnChain: { parsedData: ParsedBip21; notes?: string }
    CreateGroup: { defaultGroup?: boolean }
    EcashSendCancelled: undefined
    EnterDisplayName: undefined
    DirectChat: { memberId: string }
    EditGroup: { roomId: string }
    EditProfileSettings: undefined
    Eula: undefined
    CommunityDetails: { communityId: Community['id'] }
    FederationDetails: { federationId: Federation['id'] }
    FederationModSettings: { type?: string; federationId: Federation['id'] }
    FederationInvite: { inviteLink: string }
    FederationGreeting: undefined
    FederationAcceptTerms: { federation: RpcFederationPreview }
    FediModSettings: { type?: string; federationId?: Federation['id'] }
    HelpCentre: { fromOnboarding: boolean }
    Initializing: undefined
    JoinFederation: { invite?: string }
    LanguageSettings: undefined
    MultispendIntro: { roomId: string }
    MultispendTransactions: { roomId: string }
    CreateMultispend: { roomId: string; voters?: string[] }
    AssignMultispendVoters: { roomId: string; voters?: string[] }
    NewMessage: undefined
    NostrSettings: undefined
    NotificationsPermission:
        | { nextScreen: keyof RootStackParamList }
        | undefined
    PersonalRecovery: undefined
    PersonalRecoverySuccess: undefined
    PublicFederations: { from?: string } | undefined
    PublicCommunities: undefined
    LocateSocialRecovery: undefined
    Receive: { federationId: Federation['id'] }
    ReceiveLightning: { federationId: Federation['id'] }
    ReceiveLnurl: { federationId: Federation['id'] }
    ReceiveSuccess: {
        tx: ReceiveSuccessData
        status?: ReceiveSuccessStatus
    }
    ReceiveOffline: { federationId: Federation['id'] }
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
    RedeemLnurlWithdraw: { parsedData: ParsedLnurlWithdraw }
    LegacyChat: undefined
    LockedDevice: undefined
    RecordBackupVideo: { federationId: Federation['id'] }
    GroupChat: { groupId: string }
    RoomSettings: { roomId: string }
    GroupInvite: { groupId: string }
    RecoverFromNonceReuse: undefined
    ScanMemberCode: { inviteToRoomId?: string } | undefined
    ScanSocialRecoveryCode: { federationId: Federation['id'] }
    SelectRecoveryFileSuccess: { fileName: string }
    SelectRecoveryFileFailure: { fileName: string }
    Send: { federationId?: Federation['id'] }
    SendOfflineAmount: undefined
    SendOfflineQr: { ecash: string; amount: MSats }
    SendOnChainAmount: { parsedData: ParsedBip21 | ParsedBitcoinAddress }
    SendSuccess: { amount: MSats; unit: string }
    Settings: undefined
    ShareLogs: { ticketNumber: string } | undefined
    OmniScanner: undefined
    FediModBrowser: { url: string }
    Splash: undefined
    StabilityConfirmDeposit: { amount: Sats; federationId: Federation['id'] }
    StabilityConfirmWithdraw: {
        amountSats: Sats
        amountCents: UsdCents
        federationId: Federation['id']
    }
    StabilityDeposit: { federationId: Federation['id'] }
    StabilityDepositInitiated: { amount: Sats; federationId: Federation['id'] }
    StabilityHistory: { federationId: Federation['id'] }
    StabilityHome: { federationId: Federation['id'] }
    StabilityWithdraw: { federationId: Federation['id'] }
    StabilityWithdrawInitiated: {
        formattedFiat: string
        federationId: Federation['id']
    }
    StableBalanceIntro: { federationId: Federation['id'] }
    StartPersonalBackup: undefined
    StartRecoveryAssist: undefined
    StartSocialBackup: { federationId: Federation['id'] }
    SocialBackupCloudUpload: undefined
    SocialBackupProcessing: {
        videoFilePath: string
        federationId: Federation['id']
    }
    SocialBackupSuccess: undefined
    SocialRecoveryQrModal: undefined
    SocialRecoverySuccess: undefined
    SocialRecoveryFailure: undefined
    TabsNavigator:
        | { initialRouteName: keyof TabsNavigatorParamList }
        | undefined
    Transactions: { federationId: Federation['id'] }
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
