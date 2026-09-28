process.env.GSENDER_LOG_LEVEL = process.env.GSENDER_LOG_LEVEL || 'error';

const events = require('events');
const GrblHalController = require('../GrblHalController').default;
const GrblController = require('../../Grbl/GrblController').default;

// Exercise the real controllers and lodash timers with a simulated transport.
// No Android device or physical CNC connection is used by these tests.
class FakeConnection extends events.EventEmitter {
    constructor() {
        super();
        this.writes = [];
    }

    setWriteFilter(filter) { this.filter = filter; }
    write(data) { this.writes.push(data); }
    writeImmediate(data) { this.write(data); }
    isOpen() { return true; }
    isClose() { return false; }
}

describe('controller delayed reports during disconnect', () => {
    let controllers;

    const makeController = (Controller = GrblHalController) => {
        const connection = new FakeConnection();
        const controller = new Controller(
            { event: { on() {}, trigger() {} } },
            connection,
            { port: '/dev/fake', baudrate: 115200 }
        );
        controller.emit = jest.fn();
        controllers.push(controller);
        return { controller, connection };
    };

    beforeEach(() => {
        jest.useFakeTimers();
        controllers = [];
    });

    afterEach(() => {
        controllers.forEach(controller => controller.destroy());
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    it('coalesces settings reports and sends the newest settings while connected', () => {
        const { controller } = makeController();
        controller.runner.settings.descriptions = { 1: 'old' };
        controller.runner.emit('description');
        controller.runner.settings.descriptions = { 1: 'new' };
        controller.runner.emit('description');
        controller.runner.settings.groups = { 0: 'General' };
        controller.runner.emit('groupDetail');
        jest.advanceTimersByTime(149);
        expect(controller.emit).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(controller.emit.mock.calls).toEqual([
            ['settings:description', { 1: 'new' }],
            ['settings:group', { 0: 'General' }]
        ]);
    });

    for (const event of ['description', 'groupDetail']) {
        for (const lifecycle of ['close', 'destroy']) {
            it(`cancels a pending ${event} report on ${lifecycle}`, () => {
                const { controller } = makeController();
                controller.runner.emit(event);
                jest.advanceTimersByTime(50);
                if (lifecycle === 'close') {
                    const closed = jest.fn();
                    controller.close(closed);
                    expect(closed).toHaveBeenCalledWith(null);
                } else {
                    controller.destroy();
                }
                controller.emit.mockClear();
                expect(() => jest.advanceTimersByTime(150)).not.toThrow();
                expect(controller.emit).not.toHaveBeenCalled();
            });
        }
    }

    it('does not deliver old settings into a replacement connection', () => {
        const { controller: oldController } = makeController();
        oldController.runner.emit('description');
        oldController.runner.emit('groupDetail');
        oldController.close(() => {});
        oldController.destroy();
        oldController.emit.mockClear();

        const { controller } = makeController();
        controller.runner.settings.descriptions = { 2: 'Replacement board' };
        controller.runner.emit('description');
        expect(() => jest.advanceTimersByTime(150)).not.toThrow();
        expect(oldController.emit).not.toHaveBeenCalled();
        expect(controller.emit).toHaveBeenCalledWith('settings:description', { 2: 'Replacement board' });
    });

    for (const [name, Controller] of [['Grbl', GrblController], ['GrblHAL', GrblHalController]]) {
        it(`${name}: destroys safely while a parser query is waiting`, () => {
            const { controller, connection } = makeController(Controller);
            controller.ready = true;
            // Poll at 250 ms, then queue a trailing parser query at 500 ms.
            jest.advanceTimersByTime(500);
            controller.destroy();
            const writesAfterDestroy = connection.writes.length;
            expect(() => jest.advanceTimersByTime(1000)).not.toThrow();
            expect(connection.writes).toHaveLength(writesAfterDestroy);
            expect(controller.ready).toBe(false);
        });
    }
});
