import { DrawerNavigationProp } from '@react-navigation/drawer'
import { LinkingOptions, RouteProp } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'

import {
    FederationPreview,
    ParsedBip21,
    ParsedBitcoinAddress,
    ParsedBolt11,
    ParsedLnurlPay,
    ParsedLnurlWithdraw,
    Sats,
    Transaction,
} from '@fedi/common/types'

import { MSats, FediMod } from '.'

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
    MainNavigator: undefined
    SwitchingFederations: { federationId: string | null }
}
export type TabsNavigatorParamList = {
    Chat: undefined
    Home: { offline: boolean }
    OmniScanner: undefined
}
export type RootStackParamList = {
    AddBroadcastAdmin: { groupId: string }
    AddFediMod: undefined
    BroadcastAdminsList: { groupId: string }
    BitcoinRequest: { uri: string }
    BugReport: undefined
    BugReportSuccess: undefined
    CameraPermission: { nextScreen: keyof RootStackParamList } | undefined
    ChatWallet: { recipientId: string }
    ChooseBackupMethod: undefined
    ChooseRecoveryMethod: undefined
    CompleteRecoveryAssist: { videoPath: string; recoveryId: string }
    CompleteSocialBackup: undefined
    CompleteSocialRecovery: undefined
    ConfirmSendEcash: { amount: Sats }
    ConfirmRecoveryAssist: undefined
    ConfirmReceiveOffline: { ecash: string }
    ConfirmSendLightning: { parsedData: ParsedBolt11 | ParsedLnurlPay }
    ConfirmSendOnChain: { parsedData: ParsedBip21 }
    ConnectedFederationsDrawer: undefined
    CurrencySettings: undefined
    CreateGroup: undefined
    CreateUsername: undefined
    DirectChat: { memberId: string }
    EditGroup: { groupId: string }
    Eula: undefined
    FederationInvite: { inviteLink: string }
    FederationGreeting: undefined
    FederationAcceptTerms: { federation: FederationPreview }
    FediModSettings: undefined
    Initializing: undefined
    JoinFederation: { invite?: string }
    LanguageSettings: undefined
    MemberQrCode: undefined
    NewMessage: undefined
    NotificationsPermission:
        | { nextScreen: keyof RootStackParamList }
        | undefined
    PersonalBackupGuidance: undefined
    PersonalBackupSuccess: undefined
    PersonalRecovery: undefined
    PersonalRecoverySuccess: undefined
    PopupFederationEnded: undefined
    PublicFederations: undefined
    LocateSocialRecovery: undefined
    Receive: undefined
    ReceiveLightning: { parsedData?: ParsedLnurlWithdraw } | undefined
    ReceiveSuccess: { tx: Pick<Transaction, 'amount' | 'bitcoin'> }
    ReceiveOffline: undefined
    RecoveryWords: undefined
    RecoveryAssistSuccess: undefined
    RecordBackupVideo: undefined
    GroupChat: { groupId: string }
    GroupAdmin: { groupId: string }
    GroupInvite: { groupId: string }
    ScanMemberCode: undefined
    ScanSocialRecoveryCode: undefined
    SelectRecoveryFileSuccess: { fileName: string }
    SelectRecoveryFileFailure: { fileName: string }
    Send: undefined
    SendOfflineAmount: undefined
    SendOfflineQr: { ecash: string; amount: MSats }
    SendOnChainAmount: { parsedData: ParsedBip21 | ParsedBitcoinAddress }
    SendSuccess: { amount: MSats; unit: string }
    Settings: undefined
    FediModBrowser: { fediMod: FediMod }
    Splash: undefined
    StabilityConfirmDeposit: { amount: Sats }
    StabilityConfirmWithdraw: { amount: Sats }
    StabilityDeposit: undefined
    StabilityDepositInitiated: { amount: Sats }
    StabilityHistory: undefined
    StabilityHome: undefined
    StabilityWithdraw: undefined
    StabilityWithdrawInitiated: { amount: Sats }
    StableBalanceIntro: undefined
    StartPersonalBackup: undefined
    StartRecoveryAssist: undefined
    StartSocialBackup: undefined
    SocialBackupCloudUpload: undefined
    SocialBackupGuidance: undefined
    SocialBackupProcessing: { videoFilePath: string }
    SocialBackupSuccess: undefined
    SocialRecoveryQrModal: undefined
    SocialRecoverySuccess: undefined
    SocialRecoveryFailure: undefined
    TabsNavigator: undefined
    Transactions: undefined
    DeveloperSettings: undefined
}
