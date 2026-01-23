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
    Spv2ParsedPaymentAddress,
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
    AddFediMod: { inputMethod: 'enter' | 'scan' }
    BitcoinRequest: { invoice: string; federationId?: Federation['id'] }
    BugReportSuccess: undefined
    CameraPermission: { nextScreen: keyof RootStackParamList } | undefined
    ChatImageViewer: { uri: string; downloadable?: boolean }
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
    ChatUserConversation: { userId: string; displayName?: string }
    ChatVideoViewer: { uri: string }
    ChatWallet: { recipientId: string }
    ChooseBackupMethod: undefined
    ChooseRecoveryMethod: undefined
    ClaimEcash: { token: string }
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
    }
    CompleteSocialBackup: undefined
    CompleteSocialRecovery: undefined
    CommunityInvite: { inviteLink: string }
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
    FederationSettings: {
        federationId: Federation['id']
        federationName: string
    }
    FederationModSettings: { type?: string; federationId: Federation['id'] }
    FederationInvite: { inviteLink: string }
    FederationGreeting: undefined
    FederationAcceptTerms: { federation: RpcFederationPreview }
    FediModSettings: { type?: string; federationId?: Federation['id'] }
    HelpCentre: { fromOnboarding: boolean }
    Initializing: undefined
    JoinFederation: { invite?: string }
    LanguageSettings: undefined
    MiniAppPermissionSettings: undefined
    MultispendIntro: { roomId: string }
    MultispendTransactions: { roomId: string }
    CreateMultispend: { roomId: string; voters?: string[] }
    AssignMultispendVoters: { roomId: string; voters?: string[] }
    NewMessage: { initialInputMethod?: 'scan' | 'search' }
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
    ReceiveSuccess: {
        tx: ReceiveSuccessData
        status?: ReceiveSuccessStatus
    }
    ReceiveOffline: { federationId: Federation['id'] }
    RecoveryWords:
        | {
              nextScreenParams?: NavigationArgs
          }
        | undefined
    RecoveryAssistConfirmation: { type: 'success' | 'error' }
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
    ScanSocialRecoveryCode: undefined
    Send: { federationId?: Federation['id'] }
    SendOfflineAmount: undefined
    SendOfflineQr: { ecash: string; amount: MSats }
    SendOnChainAmount: { parsedData: ParsedBip21 | ParsedBitcoinAddress }
    SendSuccess: { amount: MSats; unit: string }
    SendSuccessShield: {
        title: string
        formattedAmount: string
        description: string
        federationId?: Federation['id']
    }
    Settings: undefined
    ShareLogs: { ticketNumber: string } | undefined
    OmniScanner: undefined
    FediModBrowser: { url?: string } | undefined
    ReceiveStabilityQr: { federationId: Federation['id'] }
    Splash: undefined
    StabilityConfirmDeposit: { amount: Sats; federationId: Federation['id'] }
    StabilityConfirmTransfer: {
        amount: UsdCents
        federationId: Federation['id']
        recipient: Spv2ParsedPaymentAddress
        notes?: string
    }
    StabilityConfirmWithdraw: {
        amountSats: Sats
        amountCents: UsdCents
        federationId: Federation['id']
    }
    StabilityDeposit: { federationId: Federation['id'] }
    StabilityHistory: { federationId: Federation['id'] }
    StabilityHome: { federationId: Federation['id'] }
    StabilityWithdraw: { federationId: Federation['id'] }
    StabilityTransfer: {
        recipient?: Spv2ParsedPaymentAddress
        federationId: Federation['id']
    }
    StabilityWithdrawInitiated: {
        formattedFiat: string
        federationId: Federation['id']
    }
    StartRecoveryAssist: undefined
    StartSocialBackup: { federationId: Federation['id'] }
    SocialBackupCloudUpload: undefined
    SocialBackupProcessing: {
        videoFilePath: string
        federationId: Federation['id']
    }
    SocialBackupSuccess: undefined
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
