import { useState, useRef, ChangeEvent, FormEvent } from 'react';
import Select from 'react-select';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { a11yDark, a11yLight } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { useWorkspaceState } from 'app/hooks/useWorkspaceState';

import Button from 'app/components/Button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from 'app/components/shadcn/Dialog';
import { Input } from 'app/components/shadcn/Input';
import Tooltip from 'app/components/Tooltip';

import { MACRO_VARIABLES } from './constants';
import insertAtCaret from './insertAtCaret';

const MAX_CHARACTERS = 128;

interface MacroFormProps {
    fullScreen?: boolean;
    id?: string;
    macroName?: string;
    macroContent?: string;
    macroDescription?: string;
    onSubmit: (data: {
        id?: string;
        name: string;
        content: string;
        description: string;
    }) => void;
    onCancel: () => void;
    title: string;
    dialogDescription?: string;
    showNameField?: boolean;
    showDescriptionField?: boolean;
    submitLabel: string;
    allowEmptyContent?: boolean;
}

interface MacroState {
    name: string;
    content: string;
    description: string;
}

interface OptionType {
    value: string;
    label: string;
}

const MacroForm = ({
    id,
    macroName = '',
    macroContent = '',
    macroDescription = '',
    onSubmit,
    onCancel,
    title,
    dialogDescription,
    showNameField = true,
    showDescriptionField = true,
    submitLabel,
    allowEmptyContent = false,
    fullScreen = false,
}: MacroFormProps) => {
    const [macroState, setMacroState] = useState<MacroState>({
        name: macroName,
        content: macroContent,
        description: macroDescription,
    });

    const { enableDarkMode } = useWorkspaceState();
    const highlightRef = useRef<HTMLDivElement>(null);
    const nameRef = useRef<HTMLInputElement>(null);
    const contentRef = useRef<HTMLTextAreaElement>(null);
    const descriptionRef = useRef<HTMLTextAreaElement>(null);

    const handleInputChange = (
        event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
        const { name, value } = event.target;
        setMacroState((prevState) => ({ ...prevState, [name]: value }));
    };

    const validateForm = (): boolean => {
        const { name, content } = macroState;
        return (
            (showNameField ? name.trim() !== '' : true) &&
            (allowEmptyContent || content.trim() !== '')
        );
    };

    const options = MACRO_VARIABLES.reduce((acc: any[], v: any) => {
        if (typeof v === 'object') {
            const { group, text } = v;
            if (v.type === 'header') {
                acc.push({ label: text, options: [] });
            } else {
                const existingGroup = acc.find((item) => item.label === group);
                if (existingGroup) {
                    existingGroup.options.push({
                        value: text,
                        label: text,
                    });
                } else {
                    acc.push({
                        label: group,
                        options: [{ value: text, label: text }],
                    });
                }
            }
        } else {
            acc.push({ value: v, label: v });
        }
        return acc;
    }, []);

    return (
        <Dialog open onOpenChange={onCancel}>
            <DialogContent className={fullScreen ? "android-macro-fullscreen bg-white" : "bg-white w-1/3 max-xl:w-[450px]"}>
                <form
                    onSubmit={(event: FormEvent) => {
                        event.preventDefault();
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>{title}</DialogTitle>
                    </DialogHeader>
                    <DialogDescription className="mt-1 mb-4 text-sm text-gray-500">
                        {dialogDescription ??
                            (fullScreen ? 'Save reusable G-code commands.' : 'Macros are a way to store and reuse commands. They can be used to speed up repetitive tasks and make your CNC more efficient.')}
                    </DialogDescription>
                    {showNameField && (
                        <div className="macro-name flex flex-col gap-2 mb-4">
                            {!fullScreen && <label>Name</label>}
                            <Input
                                ref={nameRef}
                                maxLength={MAX_CHARACTERS}
                                type="text"
                                name="name"
                                aria-label="Name"
                                placeholder={fullScreen ? "Name" : undefined}
                                value={macroState.name}
                                onChange={handleInputChange}
                                required
                            />
                        </div>
                    )}
                    <div className="macro-code flex flex-col gap-2 mb-4">
                        <div className="flex flex-row gap-2 items-center justify-between">
                            <label>G-code</label>
                            <Select<OptionType>
                                options={options}
                                onChange={(selectedOption: OptionType) => {
                                    const textarea = contentRef.current;
                                    if (textarea && selectedOption) {
                                        insertAtCaret(
                                            textarea,
                                            selectedOption.value,
                                        );
                                        setMacroState((prevState) => ({
                                            ...prevState,
                                            content: textarea.value,
                                        }));
                                    }
                                }}
                                className={fullScreen ? "macro-variable-select" : "w-1/2"}
                                maxMenuHeight={fullScreen ? 420 : 300}
                                menuPlacement="auto"
                                placeholder="Variables"
                                value={null}
                                styles={{
                                    option: (provided: any, state: any) => ({
                                        ...provided,
                                        fontSize: '0.875rem',
                                        whiteSpace: 'normal',
                                        wordWrap: 'break-word',
                                        backgroundColor: state.isFocused
                                            ? '#f0f0f0'
                                            : 'white',
                                        color: state.isFocused
                                            ? '#333'
                                            : '#666',
                                        padding: '10px',
                                        borderBottom: '1px solid #e0e0e0',
                                    }),
                                    menu: (provided: any) => ({
                                        ...provided,
                                        width: fullScreen ? 'min(420px, calc(100vw - 80px))' : '100%',
                                        right: fullScreen ? 0 : undefined,
                                        zIndex: 20,
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                        marginTop: 0,
                                    }),
                                    group: (provided: any) => ({
                                        ...provided,
                                        padding: 0,
                                    }),
                                    control: (provided: any) => ({
                                        ...provided,
                                        minWidth: '150px',
                                        maxWidth: '100%',
                                        border: '1px solid #ccc',
                                        boxShadow: 'none',
                                    }),
                                    groupHeading: (provided: any) => ({
                                        ...provided,
                                        fontWeight: 'bold',
                                        color: '#333',
                                        backgroundColor: '#e0e0e0',
                                        margin: 0,
                                    }),
                                }}
                            />
                        </div>

                        {fullScreen ? (
                            <div className="macro-code-editor">
                                <div className="macro-code-highlight" ref={highlightRef} aria-hidden="true">
                                    <SyntaxHighlighter language="gcode" style={enableDarkMode ? a11yDark : a11yLight}
                                        showLineNumbers lineNumberStyle={{ minWidth: '40px', paddingRight: '12px', color: '#94a3b8' }}
                                        customStyle={{ margin: 0, padding: '12px', background: 'transparent', fontSize: '14px', lineHeight: '24px', fontFamily: 'monospace', overflow: 'visible' }}>
                                        {macroState.content + '\n'}
                                    </SyntaxHighlighter>
                                </div>
                                <textarea ref={contentRef} name="content" aria-label="Macro G-code"
                                    spellCheck={false} autoCapitalize="off" autoCorrect="off" wrap="off"
                                    value={macroState.content} onChange={handleInputChange}
                                    onScroll={(event) => {
                                        if (highlightRef.current) {
                                            highlightRef.current.scrollTop = event.currentTarget.scrollTop;
                                            highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
                                        }
                                    }} />
                            </div>
                        ) : (
                        <Tooltip content="Add your g-code here. Use the variables or JavaScript logic to create more complex commands.">
                            <textarea
                                ref={contentRef}
                                rows={10}
                                className="border border-gray-300 rounded-md p-2 dark:text-white dark:bg-dark dark:border-gray-500"
                                name="content"
                                value={macroState.content}
                                onChange={handleInputChange}
                                required
                                title=""
                            />
                        </Tooltip>
                        )}
                    </div>
                    {showDescriptionField && (
                        <div className="macro-description flex flex-col gap-2 mb-4">
                            {!fullScreen && <label>Macro Description</label>}
                            <textarea
                                ref={descriptionRef}
                                rows={4}
                                maxLength={MAX_CHARACTERS}
                                className="border border-gray-300 rounded-md p-2 dark:text-white dark:bg-dark dark:border-gray-500"
                                name="description"
                                aria-label="Macro description"
                                placeholder={fullScreen ? "Macro description" : undefined}
                                value={macroState.description}
                                onChange={handleInputChange}
                                title=""
                            />
                        </div>
                    )}
                    <DialogFooter>
                        <Button
                            color="primary"
                            onClick={() => {
                                if (validateForm()) {
                                    const { name, content, description } =
                                        macroState;
                                    onSubmit({
                                        id,
                                        name,
                                        content,
                                        description,
                                    });
                                }
                            }}
                            data-testid="add-macro-button"
                        >
                            {submitLabel}
                        </Button>
                        <Button onClick={onCancel}>Cancel</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default MacroForm;
