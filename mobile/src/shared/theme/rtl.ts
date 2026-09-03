/**
 * RTL layout helpers (UF §31). The app forces RTL (`enforceRTL`), under which
 * React Native mirrors `flex-row` so the first child lands on the right — but
 * until the first restart (and in Jest) `I18nManager.isRTL` is still false.
 * These helpers pick the class that puts the first child at the reading start
 * (the RIGHT) in either situation, so components read right-to-left always.
 *
 * Both literals appear in this file so Tailwind generates them.
 */
import { I18nManager } from 'react-native';

export const isRTL = I18nManager.isRTL;

/** Horizontal row: first child on the right (reading start). */
export const rowStart = I18nManager.isRTL ? 'flex-row' : 'flex-row-reverse';

/** Column container whose children hug the right edge. */
export const itemsStart = I18nManager.isRTL ? 'items-start' : 'items-end';

/** Column container whose children hug the left edge (trailing side). */
export const itemsEnd = I18nManager.isRTL ? 'items-end' : 'items-start';

/** Single child hugging the right edge. */
export const selfStart = I18nManager.isRTL ? 'self-start' : 'self-end';

/** Single child hugging the left edge. */
export const selfEnd = I18nManager.isRTL ? 'self-end' : 'self-start';

/** Main-axis packing towards the reading start of a `rowStart` row. */
export const justifyStart = I18nManager.isRTL ? 'justify-start' : 'justify-end';
