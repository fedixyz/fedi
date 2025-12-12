import React, { createContext, useContext, useMemo, useReducer } from 'react'
import { VideoFile } from 'react-native-vision-camera'

// Define the structure of this Context and its initial state
interface BackupRecoveryContextState {
    recoveryFileCreated: boolean
    recoveryFileConfirmed: boolean
    socialBackupsCompleted: number
    videoFile: VideoFile | null
}
const initialState: BackupRecoveryContextState = {
    recoveryFileCreated: false,
    recoveryFileConfirmed: false,
    socialBackupsCompleted: 0,
    videoFile: null,
}
type AppState = typeof initialState

// Define actions that can change the state within this Context
enum ActionType {
    CHANGE_SOCIAL_BACKUPS_COMPLETED = 'CHANGE_SOCIAL_BACKUPS_COMPLETED',
    SET_RECOVERY_FILE_CREATED = 'SET_RECOVERY_FILE_CREATED',
    RESET_BACKUP_RECOVERY_STATE = 'RESET_BACKUP_RECOVERY_STATE',
    SAVE_VIDEO_FILE = 'SAVE_VIDEO_FILE',
    COMPLETE_SOCIAL_BACKUP = 'COMPLETE_SOCIAL_BACKUP',
}

type Action =
    | {
          type: typeof ActionType.CHANGE_SOCIAL_BACKUPS_COMPLETED
          payload: number
      }
    | {
          type: typeof ActionType.SET_RECOVERY_FILE_CREATED
          payload: boolean
      }
    | {
          type: typeof ActionType.RESET_BACKUP_RECOVERY_STATE
          payload: null
      }
    | {
          type: typeof ActionType.SAVE_VIDEO_FILE
          payload: VideoFile | null
      }
    | {
          type: typeof ActionType.COMPLETE_SOCIAL_BACKUP
      }

// Wrap with state and dispatch fields and create the Context
type BaseContext = {
    state: BackupRecoveryContextState
    dispatch: React.Dispatch<Action>
}
export const BackupRecoveryContext = createContext({} as BaseContext)

// Export action creators as convenience functions to trigger state changes
export function changeSocialBackupsCompleted(count: number): Action {
    return {
        type: ActionType.CHANGE_SOCIAL_BACKUPS_COMPLETED,
        payload: count,
    }
}
// export function completeFirstSocialBackup(): Action {
//     return {
//         type: ActionType.CHANGE_SOCIAL_BACKUPS_COMPLETED,
//         payload: 1,
//     }
// }
// export function completeSecondSocialBackup(): Action {
//     return {
//         type: ActionType.CHANGE_SOCIAL_BACKUPS_COMPLETED,
//         payload: 2,
//     }
// }
export function setRecoveryFileCreated(created: boolean): Action {
    return {
        type: ActionType.SET_RECOVERY_FILE_CREATED,
        payload: created,
    }
}
export function resetVideo(): Action {
    return {
        type: ActionType.SAVE_VIDEO_FILE,
        payload: null,
    }
}
export function saveVideo(video: VideoFile): Action {
    return {
        type: ActionType.SAVE_VIDEO_FILE,
        payload: video,
    }
}
export function completeSocialBackup(): Action {
    return {
        type: ActionType.COMPLETE_SOCIAL_BACKUP,
    }
}

// Implement the reducer with actions and state changes
export function reducer(state: AppState, action: Action): AppState {
    switch (action.type) {
        case ActionType.CHANGE_SOCIAL_BACKUPS_COMPLETED:
            return {
                ...state,
                socialBackupsCompleted: action.payload,
            }
        case ActionType.SET_RECOVERY_FILE_CREATED:
            return {
                ...state,
                recoveryFileCreated: action.payload,
            }
        case ActionType.RESET_BACKUP_RECOVERY_STATE:
            return { ...initialState }
        case ActionType.COMPLETE_SOCIAL_BACKUP:
            // Reset video file so it's not still there if user returns
            return { ...state, videoFile: null }
        case ActionType.SAVE_VIDEO_FILE:
            return { ...initialState, videoFile: action.payload }
        default:
            return state
    }
}

function BackupRecoveryProvider(props: { children: React.ReactNode }) {
    const [state, dispatch] = useReducer(reducer, initialState)

    // useMemo makes sure the Provider only re-renders when
    // there is a state change
    const providerValue = useMemo(
        () => ({ state, dispatch }),
        [state, dispatch],
    )

    return <BackupRecoveryContext.Provider value={providerValue} {...props} />
}

function useBackupRecoveryContext() {
    return useContext(BackupRecoveryContext)
}

export { BackupRecoveryProvider, useBackupRecoveryContext }
