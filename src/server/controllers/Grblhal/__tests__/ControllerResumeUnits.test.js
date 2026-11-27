process.env.GSENDER_LOG_LEVEL = 'error';
const { EventEmitter } = require('events');
const GrblController = require('../../Grbl/GrblController').default;
const GrblHalController = require('../GrblHalController').default;

class Transport extends EventEmitter {
    setWriteFilter() {}
    write() {}
    writeImmediate() {}
    isOpen() { return true; }
    isClose() { return false; }
}

// Exercise both production controllers with an inert transport, never a CNC.
describe.each([['Grbl', GrblController], ['GrblHAL', GrblHalController]])('%s resume and units', (_name, Controller) => {
    let controller;
    beforeEach(() => {
        jest.useFakeTimers();
        controller = new Controller({ event: { on() {}, trigger() {} } }, new Transport(), { port: '/dev/test', baudrate: 115200 });
        controller.emit = jest.fn();
        controller.runner.settings.settings = { $13: '0' };
        controller.settings = controller.runner.settings;
        controller.state = controller.runner.state;
    });
    afterEach(() => {
        controller.destroy();
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    test.each(['feeder', 'sender'])('%s updates units before a following tool change, without waiting for $G', (stream) => {
        controller[stream].dataFilter('G20', {});
        expect(controller.runner.getModalGroup().units).toBe('G20');
        expect(controller.populateContext({}).modal.units).toBe('G20');
        controller.emit.mockClear();
        controller[stream].dataFilter('G20', {});
        expect(controller.emit.mock.calls.filter(([event]) => event === 'controller:state')).toHaveLength(0);
        controller[stream].dataFilter('G21', {});
        expect(controller.populateContext({}).modal.units).toBe('G21');
    });

    test.each([
        ['G55', 'G54', 'G55'],
        ['G59', 'G55', 'G59'],
        ['', 'G56', 'G56'],
    ])('selects file WCS %s (current %s) before the first resume move', (fileWcs, currentWcs, expected) => {
        controller.runner.state.parserstate.modal.wcs = currentWcs;
        controller.sender.state.lines = ['G21 G90', fileWcs, 'G1 X12 Y24 Z-2 F300', 'G1 X13'];
        controller.sender.state.total = 4;
        controller.sender.setStartLine = jest.fn();
        controller.event.hasEnabledEvent = () => true;
        controller.event.getEventCode = () => 'G54'; // A start hook can also change WCS.
        const invoke = controller.command.bind(controller);
        const queued = [];
        controller.command = (name, ...args) => {
            if (name === 'gcode') { queued.push(args[0]); return; }
            return invoke(name, ...args);
        };
        controller.command('gcode:start', 3, 0, 10);
        const block = queued.find(Array.isArray);
        expect(block).toBeDefined();
        const firstMotion = block.findIndex(line => /^G0\b/.test(line));
        expect(firstMotion).toBeGreaterThan(0);
        expect(block.slice(0, firstMotion)).toEqual(['G54', expected]);
        expect(block).toContain('G0 G90 G21 X12.000 Y24.000');
        expect(controller.sender.setStartLine).toHaveBeenCalledWith(3);
    });
});
