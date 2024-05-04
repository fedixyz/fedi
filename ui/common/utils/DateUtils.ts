import format from 'date-fns/format'
import fromUnixTime from 'date-fns/fromUnixTime'
import isSameDay from 'date-fns/isSameDay'

class DateUtils {
    static DEFAULT_FORMAT = 'yyyy-MM-dd'

    formatTimestamp = (
        unixSeconds: number,
        dateFormat: string = DateUtils.DEFAULT_FORMAT,
    ): string => {
        // it is safe to use 13+ characters to detect milliseconds
        // because timestamps should never be older than 2001
        // https://stackoverflow.com/questions/23929145/how-to-test-if-a-given-time-stamp-is-in-seconds-or-milliseconds
        if (unixSeconds.toFixed(0).length >= 13) {
            throw new Error('unixSeconds must be in seconds not ms')
        }
        const timestamp = fromUnixTime(unixSeconds)
        return format(timestamp, dateFormat)
    }
    formatTxnTileTimestamp = (unixSeconds: number): string => {
        const today = new Date()
        const date = new Date(unixSeconds * 1000)

        if (isSameDay(today, date)) {
            // Show hour + minute if the timestamp is today
            return this.formatTimestamp(unixSeconds, 'h:mmaaa')
        }
        // Otherwise show the full day + time
        return this.formatTimestamp(unixSeconds, 'MMM dd, h:mmaaa')
    }
    formatChatTileTimestamp = (unixSeconds: number): string => {
        const today = new Date()
        const date = new Date(unixSeconds * 1000)

        if (isSameDay(today, date)) {
            // Show hour + minute if the timestamp is today
            return this.formatTimestamp(unixSeconds, 'h:mmaaa')
        }
        // Otherwise show the day instead of time
        return this.formatTimestamp(unixSeconds, 'MMM dd')
    }
    formatMessageItemTimestamp = (unixSeconds: number): string => {
        const today = new Date()
        const date = new Date(unixSeconds * 1000)

        if (isSameDay(today, date)) {
            // Show hour + minute if the timestamp is today
            return this.formatTimestamp(unixSeconds, 'h:mmaaa')
        }
        // Otherwise show the day instead of time
        return this.formatTimestamp(unixSeconds, 'MMM dd, h:mmaaa')
    }
    formatPopupFederationEndsAtTimestamp = (unixSeconds: number): string => {
        return this.formatTimestamp(unixSeconds, 'LLLL do')
    }
}

const dateUtils = new DateUtils()
export default dateUtils
