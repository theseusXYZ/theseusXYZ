import { useState, useMemo } from 'react'
import { SessionMachineContext } from '@/contexts/session-machine-context'
import {
    CircleArrowDown,
    Power,
    Rewind,
    History,
    Settings,
    TextQuote,
} from 'lucide-react'
import SettingsModal from '@/components/modals/settings-modal'
import IndexesModal from '@/components/modals/indexes-modal'
import { useSessionConfig } from '@/lib/services/sessionService/sessionService'
import { ICodeSnippet } from '@/panels/chat/components/ui/code-snippet'
import { useAtom } from 'jotai'
import { selectedCodeSnippetAtom } from '@/panels/editor/components/code-editor'
import { checkpointTrackerAtom } from '@/panels/timeline/lib'
import { CheckpointTracker } from '@/lib/types'
import { useModels } from '@/lib/models'

export default function ChatHeader({
    sessionId,
    headerIcon,
}: {
    sessionId?: string | null
    headerIcon?: JSX.Element
}) {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)
    const sessionActorRef = SessionMachineContext.useActorRef()
    const host = SessionMachineContext.useSelector(state => state.context.host)
    const name = SessionMachineContext.useSelector(state => state.context.name)
    const config = useSessionConfig(host, name)
    const { models } = useModels()
    const [, setSelectedCodeSnippet] = useAtom<ICodeSnippet | null>(
        selectedCodeSnippetAtom
    )
    const [checkpointTracker, setCheckpointTracker] =
        useAtom<CheckpointTracker | null>(checkpointTrackerAtom)

    async function handleReset() {
        setSelectedCodeSnippet(null)
        if (checkpointTracker) {
            setCheckpointTracker({
                ...checkpointTracker,
                selected: null,
            })
        }
        sessionActorRef.send({ type: 'session.reset' })
    }

    async function handleStop() {
        sessionActorRef.send({ type: 'session.pause' })
    }

    async function handleIndexes() {
        // sessionActorRef.send({ type: 'session.indexes' })
    }
    const model = useMemo(() => {
        if (!config?.model) return null;
        if (!models) return config.model;

        const foundModel = models.find(model => model.id === config.model);
        return foundModel ? foundModel.name : config.model;
    }, [config?.model, models]);

    return (
        <div className="relative pt-[1.5px] pb-2 border-outline-night shrink-0 items-left flex flex-row justify-between border-b mx-5">
            <div className="flex flex-row gap-4 items-center">
                <p className="text-lg font-semibold">Chat</p>
                {model && (
                    <button
                        onClick={() => setIsSettingsOpen(true)}
                        className="text-xs text-gray-400 py-[2px] px-[7px] text-ellipsis border border-primary rounded-md border-opacity-50 hover:text-gray-200 hover:border-opacity-100 transition-colors duration-100"
                    >
                        {model}
                    </button>
                )}
            </div>
            <div className="flex h-fit gap-3 mb-[2px] self-end">
                {/* <IndexesButton indexesHandler={handleIndexes} /> */}
                <RestartButton resetHandler={handleReset} />
                {/* <StopButton stopHandler={handleStop} /> */}
                <ConfigureButton
                    isSettingsOpen={isSettingsOpen}
                    setIsSettingsOpen={setIsSettingsOpen}
                />
            </div>
            {headerIcon}
        </div>
    )
}

const IndexesButton = ({ indexesHandler }: { indexesHandler: () => void }) => {
    return (
        <IndexesModal
            trigger={
                <button
                    onClick={indexesHandler}
                    className="group flex items-center gap-2 px-3 py-1 rounded-md mb-[-4px] -mr-2 smooth-hover min-w-0"
                >
                    <TextQuote
                        size={14}
                        className="group-hover:transition text-gray-400 duration-300 mb-[1px] group-hover:text-white flex-shrink-0"
                    />
                    <p className="group-hover:transition duration-300 text-gray-400 group-hover:text-white truncate">
                        Indexes
                    </p>
                </button>
            }
        />
    )
}

const RestartButton = ({ resetHandler }: { resetHandler: () => void }) => {
    return (
        <button
            onClick={resetHandler}
            className="group flex items-center gap-2 px-3 py-1 rounded-md mb-[-4px] -mr-2 smooth-hover min-w-0"
        >
            <History
                size={14}
                className="group-hover:transition text-gray-400 duration-300 mb-[1px] group-hover:text-white flex-shrink-0"
            />
            <p className="group-hover:transition duration-300 text-gray-400 group-hover:text-white truncate">
                Reset session
            </p>
        </button>
    )
}

const ConfigureButton = ({
    isSettingsOpen,
    setIsSettingsOpen,
}: {
    isSettingsOpen: boolean
    setIsSettingsOpen: (isOpen: boolean) => void
}) => {
    return (
        <SettingsModal
            isOpen={isSettingsOpen}
            setIsOpen={setIsSettingsOpen}
            trigger={
                <button className="group flex items-center gap-2 px-3 py-1 rounded-md mb-[-4px] -mr-2 smooth-hover min-w-0">
                    <Settings
                        size={14}
                        className="group-hover:transition text-gray-400 duration-300 mb-[1px] group-hover:text-white flex-shrink-0"
                    />
                    <p className="group-hover:transition duration-300 text-gray-400 group-hover:text-white truncate">
                        Configure session
                    </p>
                </button>
            }
        />
    )
}

const StopButton = ({ stopHandler }: { stopHandler: () => void }) => {
    return (
        <button
            onClick={stopHandler}
            className="group flex items-center gap-2 px-3 py-1 rounded-md mb-[-4px] smooth-hover"
        >
            <Power
                size={14}
                className="group-hover:transition text-gray-400 group-hover:text-white duration-300 mb-[1px]"
            />
            <p className="group-hover:transition duration-300 text-gray-400 group-hover:text-white">
                Stop session
            </p>
        </button>
    )
}
