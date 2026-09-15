import { useEffect, useState } from 'react';
import { scheduleLineCount } from './line-count.mjs';

export function useLineCount(content: string, knownTotal: number) {
    const [result, setResult] = useState({content: '', count: 0});
    useEffect(() => {
        // Parsed metadata already counts the job. Only use the fallback while
        // metadata is unavailable, yielding between small chunks for touch input.
        setResult(previous => previous.content ? {content: '', count: 0} : previous);
        if (!content || knownTotal > 0) return;
        return scheduleLineCount(content, count => setResult({content, count}));
    }, [content, knownTotal]);
    return knownTotal > 0 || result.content !== content ? 0 : result.count;
}
