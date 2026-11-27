import manual from '../manualToolchange';
import semiAuto from '../semiautoToolchange';
import GcodeToolpath from 'server/lib/GcodeToolpath';

jest.mock('app/lib/toolChangeUtils', () => ({ getProbeSettings: jest.fn(), getToolString: () => 'T2' }));
jest.mock('app/store/redux', () => ({ store: { getState: () => ({}) } }));

const saved = { XPOS: 25.4, YPOS: 50.8, ZPOS: -2.54, UNITS: 'G20', SPINDLE: 'M5', DISTANCE: 'G90', FEEDRATE: 'F10', TOOL_OFFSET: 12.7, PROBE_DISTANCE: 30, PROBE_FEEDRATE: 100, PROBE_SLOW_FEEDRATE: 50, RETRACT: 2 };
const expand = (line: string) => line.replace(/\[global\.toolchange\.(\w+)\]/g, (_, key) => String(saved[key]));
const actions = (wizard) => wizard.steps.flatMap(step => step.substeps.flatMap(sub => sub.actions || []));

describe('tool change in an inch-mode job', () => {
    test.each([['manual', manual], ['semi-automatic first tool', semiAuto(1)], ['semi-automatic later tool', semiAuto(2)]])('%s restores saved millimetre coordinates before restoring inch mode', (_name, wizard) => {
        const resume = actions(wizard).find(action => action.label.startsWith('Resume'));
        const path = new GcodeToolpath();
        path.loadFromStringSync(['G20 G90', ...resume.gcodeLines.map(expand).filter(line => !line.startsWith('%'))].join('\n'));
        expect(path.getPosition()).toMatchObject({ x: 25.4, y: 50.8, z: -2.54 });
        expect(path.getModal().units).toBe('G20');
        expect(path.getModal().distance).toBe('G90');
    });

    test('semi-automatic tool offset is applied in millimetres', () => {
        const probe = actions(semiAuto(2)).find(action => action.label === 'Probe Changed Tool');
        const code = probe.gcodeLines.map(expand);
        const offsetIndex = code.findIndex(line => line.startsWith('G10'));
        const path = new GcodeToolpath();
        path.loadFromStringSync(['G20', ...code.slice(0, offsetIndex)].join('\n'));
        expect(path.getModal().units).toBe('G21');
        expect(code[offsetIndex]).toBe('G10 L20 P0 Z12.7');
    });
});
