import { useEffect, useState } from 'react';
import store from 'app/store';

export default function useRotaryEnabled() {
    const [enabled, setEnabled] = useState(() => Boolean(store.get('widgets.rotary.tab.show', false)));
    useEffect(() => {
        const sync = () => setEnabled(Boolean(store.get('widgets.rotary.tab.show', false)));
        sync();
        store.on('change', sync);
        return () => { store.removeListener('change', sync); };
    }, []);
    return enabled;
}
