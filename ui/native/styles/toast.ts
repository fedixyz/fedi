import { Theme } from '@rneui/themed'
import { StyleSheet } from 'react-native'

export const toastStyles = (theme: Theme) =>
    StyleSheet.create({
        toastOuter: {
            position: 'absolute',
            top: 0,
            left: 40,
            width: '100%',
            borderRadius: 16,
            elevation: 10,
            zIndex: 10,
            backgroundColor: theme.colors.black,
        },
        toastShadow1: {
            shadowColor: theme.colors.black,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.15,
            shadowRadius: 4,
            backgroundColor: theme.colors.black,
        },
        toastShadow2: {
            shadowColor: theme.colors.black,
            shadowOffset: { width: 0, height: 7 },
            shadowOpacity: 0.13,
            shadowRadius: 7,
            backgroundColor: theme.colors.black,
        },
        toastShadow3: {
            shadowColor: theme.colors.black,
            shadowOffset: { width: 0, height: 16 },
            shadowOpacity: 0.08,
            shadowRadius: 10,
            backgroundColor: theme.colors.black,
        },
        toastShadow4: {
            shadowColor: theme.colors.black,
            shadowOffset: { width: 0, height: 29 },
            shadowOpacity: 0.02,
            shadowRadius: 12,
            backgroundColor: theme.colors.black,
        },
        toastShadow5: {
            shadowColor: theme.colors.black,
            shadowOffset: { width: 0, height: 46 },
            shadowOpacity: 0,
            shadowRadius: 13,
            backgroundColor: theme.colors.black,
        },

        // inner wrappers & content
        wrapper: {
            flexGrow: 1,
            borderRadius: 16,
        },
        toast: {
            padding: 14,
            gap: 12,
        },
        contentRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
        },
        toastIcon: { fontSize: 20 },
        toastText: {
            color: theme.colors.white,
            fontSize: 14,
            fontFamily: 'AlbertSans-Regular',
        },

        // action button
        actionButton: {
            width: '100%',
            paddingHorizontal: 16,
            paddingVertical: 6,
            borderRadius: 12,
            backgroundColor: theme.colors.darkGrey,
        },
        actionButtonText: {
            color: theme.colors.white,
            fontSize: 13,
            fontWeight: '500',
            fontFamily: 'AlbertSans-Medium',
            textAlign: 'center',
        },
    })
