/**
 * Colours the wallet service prototype uses that the theme has no token for.
 *
 * The theme's `green`/`green100` are far more saturated than the prototype's
 * and make passive affirmations shout, and there is no token between
 * `white` and `grey50` for the prototype's flat card fill. Promote these to
 * the theme if a screen outside this flow needs them.
 */

/** `--green`: affirmation text, badges, and the live dot. */
export const SERVICE_GREEN = '#2C8A4A'

/** `--green-soft`: the fill behind green badges. */
export const SERVICE_GREEN_BG = '#E2F3E6'

/** The prototype's flat card grey, one step lighter than `grey100`. */
export const SERVICE_CARD_BG = '#FAFAFA'

/** The neutral pill text in the prototype; `grey` is a shade too light. */
export const SERVICE_BADGE_GREY = '#555555'
