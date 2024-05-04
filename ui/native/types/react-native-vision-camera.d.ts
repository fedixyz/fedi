import 'react-native-vision-camera'

declare module 'react-native-vision-camera' {
    export interface VideoFile {
        size?: number
    }
}
