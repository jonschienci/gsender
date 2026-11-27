import React from 'react';
import { act, render } from '@testing-library/react';
import pubsub from 'pubsub-js';
import { SettingsProvider, useSettings } from '../SettingsContext';
import { resolveGrblCoreDefaults } from '../grblCoreMigration';
import { getFilteredEEPROMSettings } from '../EEPROM';

let mockState = {
    controller: { type: 'grblHAL', settings: { settings: {}, descriptions: {}, groups: {}, version: { semver: '1.1.0' }, info: { BOARD: 'SLB' } } },
    connection: { isConnected: true },
};
jest.mock('react-redux', () => ({ useSelector: fn => fn(mockState) }));
jest.mock('app/store/redux', () => ({ store: { getState: () => mockState } }));
jest.mock('app/store', () => ({ get: (key, fallback) => key === 'workspace.machineProfile' ? { id: 0 } : fallback }));
jest.mock('app/features/Config/assets/SettingsMenu.ts', () => ({ SettingsMenu: [{ settings: [{ settings: [{ type: 'number', key: 'example' }] }] }] }));
jest.mock('app/features/Config/assets/SettingsDescriptions.ts', () => ({ GRBL_HAL_SETTINGS_MAP: new Map(), GRBL_SETTINGS_MAP: new Map() }));
jest.mock('app/features/Config/assets/MachineDefaults/defaultMachineProfiles.ts', () => [{ id: 0, grblHALeepromSettings: { $100: 100 }, eepromSettings: { $100: 80 } }]);
jest.mock('app/lib/firmwareSemver.ts', () => ({ firmwarePastVersion: () => false }));
jest.mock('../EEPROM', () => ({ getFilteredEEPROMSettings: jest.fn(() => []) }));
jest.mock('../grblCoreMigration', () => ({
    resolveGrblCoreDefaults: jest.fn(({ baseDefaults, boardId }) => ({ defaults: boardId === 'changed' ? { $100: 200 } : baseDefaults })),
    translateGrblCoreKey: key => key,
}));

describe('Config cached defaults and subscription lifetime', () => {
    let context;
    const Consumer = () => { context = useSettings(); return null; };
    beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); pubsub.clearAllSubscriptions(); });
    afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); pubsub.clearAllSubscriptions(); });

    test('repeated settings lookups and searches share resolved defaults; board changes invalidate them', () => {
        const view = render(<SettingsProvider><Consumer /></SettingsProvider>);
        act(() => jest.advanceTimersByTime(250));
        const initialCalls = (resolveGrblCoreDefaults as jest.Mock).mock.calls.length;
        for (let i = 0; i < 500; i++) {
            expect(context.getEEPROMDefaultValue('$100')).toBe(100);
            expect(context.eepromIsDefault({ setting: '$100', value: '100.000', dataType: 6 })).toBe(true);
        }
        act(() => context.setSearchTerm('speed'));
        expect(resolveGrblCoreDefaults).toHaveBeenCalledTimes(initialCalls);
        mockState = { ...mockState, controller: { ...mockState.controller, settings: { ...mockState.controller.settings, info: { BOARD: 'changed' } } } };
        view.rerender(<SettingsProvider><Consumer /></SettingsProvider>);
        expect(context.getEEPROMDefaultValue('$100')).toBe(200);
        expect(resolveGrblCoreDefaults).toHaveBeenCalledTimes(initialCalls + 1);
        view.unmount();
    });

    test('unmount cancels delayed EEPROM work and removes pubsub subscriptions', () => {
        const view = render(<SettingsProvider><Consumer /></SettingsProvider>);
        view.unmount();
        act(() => jest.advanceTimersByTime(250));
        expect(getFilteredEEPROMSettings).not.toHaveBeenCalled();
        expect(pubsub.publishSync('repopulate')).toBe(false);
        expect(pubsub.publishSync('eeprom:repopulate')).toBe(false);
    });
});
