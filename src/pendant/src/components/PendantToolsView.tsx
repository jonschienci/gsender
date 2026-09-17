import { TbRulerMeasure } from 'react-icons/tb';
import ToolCard from 'app/components/ToolCard';
import { BiSolidCylinder } from 'react-icons/bi';
import { FaGamepad, FaKeyboard, FaSdCard } from 'react-icons/fa';
import { GiFlatPlatform } from 'react-icons/gi';
import { LuDrill } from 'react-icons/lu';
import { MdSquareFoot } from 'react-icons/md';

export default function PendantToolsView() {
    return (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-3">
            <h1 className="text-xl font-bold dark:text-content-primary mb-1">
                Tools
            </h1>
            <p className="text-sm text-gray-500 dark:text-content-muted mb-3">
                Tools included with gSender.
            </p>

            <div className="grid grid-cols-2 gap-3">
                <ToolCard
                    title="Surfacing"
                    description="Flatten your wasteboard or other non-flat stock"
                    icon={GiFlatPlatform}
                />

                <ToolCard
                    title="Rotary Surfacing"
                    description="Turn square material into round stock for rotary cutting"
                    icon={BiSolidCylinder}
                />

                <ToolCard
                    title="Movement Tuning"
                    description="Ensure that each axis of your machine is moving accurately"
                    icon={TbRulerMeasure}
                />

                <ToolCard
                    title="XY Squaring"
                    description="Get your CNC accurately aligned to make square cuts"
                    icon={MdSquareFoot}
                />

                <ToolCard
                    title="Keyboard Shortcuts"
                    description="Set up keyboard shortcuts for easy navigation and control"
                    icon={FaKeyboard}
                />

                <ToolCard
                    title="Gamepad"
                    description="Easy hand-held CNC control using pre-made or custom profiles"
                    icon={FaGamepad}
                />

                <ToolCard
                    title={'SD Card Manager'}
                    description={'Manage and view files on your SD card'}
                    icon={FaSdCard}
                />
                <ToolCard
                    title={'Accessory Installation'}
                    description={'Install various CNC Accessories'}
                    icon={LuDrill}
                />

            </div>
        </div>
    );
}
