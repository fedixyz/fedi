import { NetInfoState } from '@react-native-community/netinfo'

export function checkIsInternetUnreachable(networkInfo: NetInfoState | null) {
    if (!networkInfo) return false
    if (networkInfo.isConnected === false) return true
    // sometimes isInternetReachable is null which does not definitively
    // mean the internet is unreachable so explicitly check for false
    if (networkInfo.isInternetReachable === false) return true
    else return false
}
