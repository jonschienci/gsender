import { useEffect } from 'react';
import { WizardProvider } from 'app/features/Helper/context';
import HelperWrapper from 'app/features/Helper/HelperWrapper';
import { registerPendantToolChanges } from './pendant-tool-change';

export default function PendantToolChange() {
    useEffect(registerPendantToolChanges, []);
    return <div className="android-toolchange-contained"><WizardProvider><HelperWrapper /></WizardProvider></div>;
}
