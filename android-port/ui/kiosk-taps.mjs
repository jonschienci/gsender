// Five distinct activations in a two-second window; unrelated touches reset it.
export const createKioskTapSequence = () => {
    let first = null;
    let last = null;
    let count = 0;
    const reset = () => { first = last = null; count = 0; };
    return {
        reset,
        tap(now) {
            if (!Number.isFinite(now)) { reset(); return false; }
            if (first === null || now < last || now - first > 2000) {
                first = now; count = 0;
            }
            if (now === last) return false;
            last = now;
            if (++count !== 5) return false;
            reset();
            return true;
        },
    };
};
