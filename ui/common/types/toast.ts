export interface ToastArgs {
    content: string
    key?: string
    status?: ToastStatus
}

export type ToastStatus = 'success' | 'error' | 'info'

export type Toast = Required<ToastArgs>
