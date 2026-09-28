// Reuses the upstream tool-change workflow in the Android pendant.
import controller from 'app/lib/controller';
import store from 'app/store';
import pubsub from 'pubsub-js';
import { toast } from 'app/lib/toaster';
import manualToolChange from 'app/wizards/manualToolchange';
import semiautoToolChange from 'app/wizards/semiautoToolchange';
import { determineFixedSensorInstructions } from 'app/lib/toolChangeUtils';
import { Confirm } from 'app/components/ConfirmationDialog/ConfirmationDialogLib';

export function registerPendantToolChanges() {
    const listeners: Array<[string, (...args: any[]) => any]> = [];
    const listen = (event: string, callback: (...args: any[]) => any) => {
        controller.addListener(event, callback);
        listeners.push([event, callback]);
    };
    listen(
        'gcode:toolChange',
        async (context: any, comment = '') => {
            const payload = {
                context,
                comment,
            };
            const skipDialog = store.get(
                'workspace.toolChange.skipDialog',
                false,
            );

            const { option, count } = context;
            if (option === 'Pause') {
                const msg =
                    'Toolchange pause' + (comment ? ` - ${comment}` : '');
                if (!skipDialog) {
                    toast.info(msg, { position: 'bottom-right' });
                }
            } else {
                let title, instructions;

                if (option === 'Standard Re-zero') {
                    title = 'Standard Re-zero Tool Change';
                    instructions = manualToolChange;
                } else if (option === 'Flexible Re-zero') {
                    title = 'Flexible Re-zero Tool Change';
                    instructions = semiautoToolChange(count);
                } else if (option === 'Fixed Tool Sensor') {
                    title = 'Fixed Tool Sensor Tool Change';
                    instructions = await determineFixedSensorInstructions(
                        count,
                        comment,
                    );
                } else {
                    console.error('Invalid toolchange option passed');
                    return;
                }

                if (instructions.onStart) {
                    const onStart = instructions.onStart();
                    controller.command('wizard:start', onStart);
                }

                pubsub.publish('wizard:load', {
                    ...payload,
                    title,
                    instructions,
                });
            }
        },
    );

    listen('toolchange:preHookComplete', (comment = '') => {
        const onConfirmhandler = () => {
            controller.command('toolchange:post');
        };

        const content =
            comment.length > 0 ? (
                <div>
                    <p>
                        A toolchange command (M6) was found - click confirm to
                        verify the tool has been changed and run your
                        post-toolchange code.
                    </p>
                    <p>
                        Comment: <b>{comment}</b>
                    </p>
                </div>
            ) : (
                'A toolchange command (M6) was found - click confirm to verify the tool has been changed and run your post-toolchange code.'
            );

        Confirm({
            title: 'Confirm Toolchange',
            content,
            confirmLabel: 'Confirm toolchange',
            onConfirm: onConfirmhandler,
        });
    });

    listen(
        'wizard:next',
        (stepIndex: number, substepIndex: number) => {
            pubsub.publish('wizard:next', { stepIndex, substepIndex });
        },
    );

    return () => listeners.forEach(([event, callback]) => controller.removeListener(event, callback));
}
