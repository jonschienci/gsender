import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Search } from '../Search';
import { Menu } from '../Menu';
import { useSettings } from '../../utils/SettingsContext';

jest.mock('../../utils/SettingsContext', () => ({ useSettings: jest.fn() }));
const useContextMock = useSettings as jest.Mock;

describe('Config responsiveness', () => {
    let setSearchTerm;
    beforeEach(() => {
        jest.useFakeTimers();
        setSearchTerm = jest.fn();
        useContextMock.mockReturnValue({ searchTerm: '', setSearchTerm });
    });
    afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

    test('typing updates immediately but filters once after the final keypress', () => {
        render(<Search />);
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'a' } });
        act(() => jest.advanceTimersByTime(100));
        fireEvent.change(input, { target: { value: 'acceleration' } });
        expect(input).toHaveValue('acceleration');
        expect(setSearchTerm).not.toHaveBeenCalled();
        act(() => jest.advanceTimersByTime(200));
        expect(setSearchTerm.mock.calls).toEqual([['acceleration']]);
    });
    test('clearing or closing Config cannot deliver a stale search later', () => {
        const view = render(<Search />);
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'old' } });
        fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
        act(() => jest.advanceTimersByTime(200));
        expect(setSearchTerm.mock.calls).toEqual([['']]);
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'unmounted' } });
        view.unmount();
        act(() => jest.advanceTimersByTime(200));
        expect(setSearchTerm.mock.calls).toEqual([['']]);
    });
    test('Enter applies a pending search immediately', () => {
        render(<Search />);
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'feed' } });
        fireEvent.submit(input.closest('form'));
        expect(setSearchTerm.mock.calls).toEqual([['feed']]);
    });
    test('scrolling the section highlight does not re-filter the settings menu', () => {
        const settingsFilter = jest.fn(() => true);
        useContextMock.mockReturnValue({ settingsFilter });
        const menu = [{ label: 'General', icon: () => null, settings: [{ settings: [{ key: 'one' }, { key: 'two' }] }] }] as any;
        const view = render(<Menu menu={menu} activeSection="h-section-0" />);
        expect(settingsFilter).toHaveBeenCalledTimes(2);
        view.rerender(<Menu menu={menu} activeSection="h-section-1" />);
        expect(settingsFilter).toHaveBeenCalledTimes(2);
        useContextMock.mockReturnValue({ settingsFilter: () => false });
        view.rerender(<Menu menu={menu} activeSection="h-section-1" />);
        expect(screen.getByText('General').closest('button')).toHaveClass('hidden');
    });
});
