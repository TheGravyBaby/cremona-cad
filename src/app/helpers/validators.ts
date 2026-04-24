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
        if (val < min && tooSmallMsg) error(tooSmallMsg, 'Invalid Value');
        if (val > max && tooBigMsg) error(tooBigMsg, 'Invalid Value');
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