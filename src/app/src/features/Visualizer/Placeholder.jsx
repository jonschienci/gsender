import { useEffect } from 'react';
import PlaceholderImage from './images/placeholder.png';
import pubsub from 'pubsub-js';
import store from 'app/store';
import _get from 'lodash/get';

export function VisualizerPlaceholder() {
    useEffect(() => {
        const token = pubsub.subscribe(
            'placeholder:invalidLines',
            (msg, payload) => {
                // Accept old event publishers while retaining the true count
                // when the parser sends a bounded sample of invalid lines.
                const invalidLines = Array.isArray(payload) ? payload : payload?.invalidLines || [];
                const invalidLineCount = Array.isArray(payload) ? payload.length : payload?.invalidLineCount ?? invalidLines.length;
                const showWarningsOnLoad = store.get(
                    'widgets.visualizer.showWarning',
                    false,
                );
                if (showWarningsOnLoad) {
                    if (invalidLineCount > 0) {
                        // Put it in the modal somehow
                        const lineSample = invalidLines.slice(0, 5);
                        const description = (
                            <div className={'flex flex-col gap-2'}>
                                <p>
                                    Detected {invalidLineCount} invalid lines
                                    on file load. Your job may not run
                                    correctly.
                                </p>
                                <p>Sample invalid lines found include:</p>
                                <ol>
                                    {lineSample.map((line) => (
                                        <li className="text-xs">
                                            -<b> {line}</b>
                                        </li>
                                    ))}
                                </ol>
                            </div>
                        );
                        pubsub.publish('helper:info', {
                            title: 'Invalid Lines Detected',
                            description,
                        });
                    }
                }
            },
        );

        return () => {
            pubsub.unsubscribe(token);
        };
    }, []);
    return (
        <div className="bg-transparent w-full h-full flex items-center justify-center ">
            <img src={PlaceholderImage} alt={'Louis the dog placeholder'} />
        </div>
    );
}
