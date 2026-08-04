import { error } from "../shared/message-emitter";

export function isOutOfRange(value: number, min: number, max = Infinity): boolean {
    return value < min || value > max;
}

const errorMessages = [
    "Stradivari never had this problem.",
    "A circle walked into a bar and nothing intersected.",
    "These are not the curves you're looking for.",
    "It's gonna be okay.",
    "Back to the drafting board.",
    "Perhaps we should just use paper.",
    "Surely you can't expect the math to be perfect every time.",
];
let errorIndex = 0;

/** Titles carry the field, because titles are identity: messages dedupe by them and a dismissed
 * one collapses to a chip under them. A shared title made every clamp look like the same problem,
 * so two bad fields showed as one and the later text overwrote the earlier. */
function fieldTitle(key: string): string {
    const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    return `Invalid ${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

export function clampParam(
    params: any,
    key: keyof typeof params,
    min: number,
    max = Infinity,
    tooSmallMsg?: string,
    tooBigMsg?: string,
): boolean {
    const val = params[key] as number;
    if (val < min || val > max) {
        const clamped = Math.min(Math.max(val, min), max);
        (params[key] as number) = clamped;
        const title = fieldTitle(String(key));
        if (val < min && tooSmallMsg) error(tooSmallMsg, title);
        if (val > max && tooBigMsg) error(tooBigMsg, title);
        return true;
    }
    return false;
}

export function safeRun(fn: () => void): void {
    try {
        fn();
    } catch (e: any) {
        const msg = errorMessages[errorIndex % errorMessages.length];
        errorIndex++;
        error(msg, 'An Error Occurred :[');
        console.error(e)
    }
}