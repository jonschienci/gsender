import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PendantConfigView from '../PendantConfigView';
import controller from 'app/lib/controller';

let mockState = { connection: { isConnected: true }, controller: { workflow: { state: 'idle' } } };
jest.mock('app/store/redux', () => ({ store: { getState: () => mockState } }));
jest.mock('app/lib/controller', () => ({ command: jest.fn() }));
jest.mock('app/features/Config/utils/SettingsContext', () => ({ SettingsProvider: ({ children }) => children }));
jest.mock('app/features/Config', () => ({ Config: () => <input aria-label="pending setting" defaultValue="initial" /> }));

test('returning to Config preserves unsaved input and refreshes EEPROM only while connected and idle', () => {
    const view = render(<PendantConfigView active />);
    fireEvent.change(screen.getByLabelText('pending setting'), { target: { value: 'unsaved edit' } });
    expect(controller.command).not.toHaveBeenCalled();
    view.rerender(<PendantConfigView active={false} />);
    expect(screen.getByLabelText('pending setting').closest('.hidden')).not.toBeNull();
    view.rerender(<PendantConfigView active />);
    expect(screen.getByLabelText('pending setting')).toHaveValue('unsaved edit');
    expect(controller.command).toHaveBeenCalledWith('gcode', ['$$']);
    (controller.command as jest.Mock).mockClear();
    mockState.controller.workflow.state = 'running';
    view.rerender(<PendantConfigView active={false} />);
    view.rerender(<PendantConfigView active />);
    expect(controller.command).not.toHaveBeenCalled();
    mockState.controller.workflow.state = 'idle';
    mockState.connection.isConnected = false;
    view.rerender(<PendantConfigView active={false} />);
    view.rerender(<PendantConfigView active />);
    expect(controller.command).not.toHaveBeenCalled();
});
