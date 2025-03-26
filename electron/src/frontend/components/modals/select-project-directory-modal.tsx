import FolderPicker from '@/components/ui/folder-picker'
import { useState, lazy, useEffect, Suspense } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'

import { ActorRefFrom, AnyMachineSnapshot } from 'xstate'
import { newSessionMachine } from '@/lib/services/stateMachineService/stateMachine'
import { useSafeStorage } from '@/lib/services/safeStorageService'
import * as VisuallyHidden from '@radix-ui/react-visually-hidden'
import IndexManagementModal from './index-management-modal'
import { savedFolderPathAtom } from '@/lib/utils'
import { useAtomValue } from 'jotai'

const Dialog = lazy(() =>
    import('@/components/ui/dialog').then(module => ({
        default: module.Dialog,
    }))
)

const DialogTrigger = lazy(() =>
    import('@/components/ui/dialog').then(module => ({
        default: module.DialogTrigger,
    }))
)

const DialogContent = lazy(() =>
    import('@/components/ui/dialog').then(module => ({
        default: module.DialogContent,
    }))
)

const DialogHeader = lazy(() =>
    import('@/components/ui/dialog').then(module => ({
        default: module.DialogHeader,
    }))
)

const DialogTitle = lazy(() =>
    import('@/components/ui/dialog').then(module => ({
        default: module.DialogTitle,
    }))
)

const DialogDescription = lazy(() =>
    import('@/components/ui/dialog').then(module => ({
        default: module.DialogDescription,
    }))
)

const SelectProjectDirectoryModal = ({
    trigger,
    openProjectModal,
    setOpenProjectModal,
    hideclose,
    header,
    sessionActorref,
    state,
    model,
}: {
    trigger?: JSX.Element
    openProjectModal?: boolean
    setOpenProjectModal?: (open: boolean) => void
    hideclose?: boolean
    header?: JSX.Element
    sessionActorref: ActorRefFrom<typeof newSessionMachine>
    state: AnyMachineSnapshot
    model: string
}) => {
    const [folderPath, setFolderPath] = useState('')
    const [open, setOpen] = useState(false)
    const [page, setPage] = useState(1)
    const [indexExists, setIndexExists] = useState(false)
    const [shouldIndex, setShouldIndex] = useState(false)
    const [isIndexManagementModalOpen, setIsIndexManagementModalOpen] =
        useState(false)

    const { getApiKey } = useSafeStorage()
    const [apiKey, setApiKey] = useState('')
    const savedFolderPath = useAtomValue(savedFolderPathAtom)

    useEffect(() => {
        getApiKey(model).then(value => {
            if (value) {
                setApiKey(value)
            }
        })
    }, [])
    // }, [open])

    function checkIndexExists(s: string) {
        return true
    }

    useEffect(() => {
        if (savedFolderPath) {
            setFolderPath(savedFolderPath)
        }
    }, [savedFolderPath])

    useEffect(() => {
        if (folderPath) {
            // checkIndexExists(folderPath).then(exists => {
            //     setIndexExists(exists)
            //     setShouldIndex(exists) // If index exists, default to using it
            // })
            let found = false
            setIndexExists(found)
            setShouldIndex(found)
        }
    }, [folderPath])

    const handleIndexCheckboxChange = (checked: boolean) => {
        setShouldIndex(checked)
        if (checked && !indexExists) {
            setIsIndexManagementModalOpen(true)
        }
    }

    function validate() {
        return folderPath !== ''
    }

    async function afterSubmit() {
        sessionActorref.send({
            type: 'session.create',
            payload: {
                path: folderPath,
                agentConfig: {
                    model: model,
                    api_key: apiKey,
                },
                indexing: {
                    shouldIndex: shouldIndex,
                    indexExists: indexExists,
                },
            },
        })
        sessionActorref.on('session.creationComplete', () => {
            sessionActorref.send({
                type: 'session.init',
                payload: {
                    agentConfig: {
                        model: model,
                        api_key: apiKey,
                    },
                },
            })
        })
        setOpen(false)
    }

    async function handleContinueChat() {
        sessionActorref.send({
            type: 'session.init',
            payload: {
                agentConfig: {
                    model: model,
                    api_key: apiKey,
                },
            },
        })
    }

    function handleOpenChange(open: boolean) {
        setOpen(open)
        if (setOpenProjectModal) setOpenProjectModal(open)
        // if (!backendUrl) return
        // getSessions(backendUrl).then(res => setSessions(res))
    }

    useEffect(() => {
        if (openProjectModal === undefined) return
        setOpen(openProjectModal)
    }, [openProjectModal])

    return (
        <Suspense fallback={<></>}>
            {(state.matches('sessionReady') ||
                state.matches({ setup: 'sessionDoesNotExist' })) && (
                <Dialog open={open} onOpenChange={handleOpenChange}>
                    {trigger && (
                        <DialogTrigger asChild>{trigger}</DialogTrigger>
                    )}
                    <DialogContent
                        hideclose={
                            hideclose ? true.toString() : false.toString()
                        }
                    >
                        <VisuallyHidden.Root>
                            <DialogHeader>
                                <DialogTitle>
                                    Select Project Directory
                                </DialogTitle>
                            </DialogHeader>
                        </VisuallyHidden.Root>
                        <div className="dark mx-8 my-4">
                            {state.matches('sessionReady') ? (
                                <>
                                    <ExistingSessionFound
                                        continueChat={handleContinueChat}
                                        newChat={() => {
                                            sessionActorref.send({
                                                type: 'session.delete',
                                            })
                                        }}
                                    />
                                </>
                            ) : (
                                <></>
                            )}

                            {/* {sessions?.length > 0 && page === 1 ? (
                        <ExistingSessionFound
                            sessions={sessions}
                            setPage={setPage}
                            onClick={afterSubmit}
                        />
                    ) : sessions?.length === 0 || page === 2 ? (
                       
                    ) : (
                        <></>
                    )} */}

                            {state.matches({ setup: 'sessionDoesNotExist' }) ? (
                                <>
                                    {page !== 1 && (
                                        <button
                                            className="top-3 left-3 absolute text-primary mb-2 flex items-center p-1"
                                            //  onClick={() => setPage(1)}
                                        >
                                            <ArrowLeft
                                                size={18}
                                                className="mr-1"
                                            />
                                            {/* {'Back'} */}
                                        </button>
                                    )}
                                    {/* {header} */}
                                    <SelectProjectDirectoryComponent
                                        folderPath={folderPath}
                                        setFolderPath={setFolderPath}
                                    />
                                    {/* <div className="flex items-center space-x-2 mt-4">
                                        <Checkbox
                                            id="indexCheckbox"
                                            checked={shouldIndex}
                                            onCheckedChange={
                                                handleIndexCheckboxChange
                                            }
                                        />
                                        <label htmlFor="indexCheckbox">
                                            {indexExists
                                                ? 'Index found. Use existing index'
                                                : 'Index this codebase (Recommended for better assistance)'}
                                        </label>
                                    </div> */}
                                    <IndexManagementModal
                                        isOpen={isIndexManagementModalOpen}
                                        setOpen={setIsIndexManagementModalOpen}
                                        folderPath={folderPath}
                                    />
                                    <StartChatButton
                                        disabled={!validate()}
                                        onClick={afterSubmit}
                                    />
                                </>
                            ) : (
                                <></>
                            )}
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </Suspense>
    )
}

export default SelectProjectDirectoryModal

export const SelectProjectDirectoryComponent = ({
    folderPath,
    setFolderPath,
    disabled = false,
    className,
}: {
    folderPath: string
    setFolderPath: (path: string) => void
    disabled?: boolean
    className?: string
}) => {
    return (
        <div className={`flex flex-col ${className ?? ''}`}>
            <p className="text-lg font-bold mb-4">
                Select your project directory
            </p>
            <FolderPicker
                folderPath={folderPath}
                setFolderPath={setFolderPath}
                disabled={disabled}
            />
        </div>
    )
}

export const StartChatButton = ({ onClick, disabled }) => {
    return (
        <Button
            disabled={disabled}
            className="bg-primary text-white p-2 rounded-md mt-10 w-full"
            onClick={onClick}
        >
            Start Chat
        </Button>
    )
}

const ExistingSessionFound = ({ continueChat, newChat }) => {
    return (
        <div className="dark">
            <div>
                <DialogDescription asChild>
                    <p className="text-2xl font-bold">
                        Continue previous chat?
                    </p>
                </DialogDescription>
                {/* <p className="text-md mt-2 text-neutral-400">
                        {`Previous task: "`}
                        <span className="italic">Create a snake game</span>
                        {`"`}
                    </p> */}
                <div className="flex flex-col items-center">
                    <Button
                        type="submit"
                        className="bg-primary text-white p-2 rounded-md w-full mt-7"
                        onClick={continueChat}
                    >
                        Continue
                    </Button>
                    <div className="bg-neutral-600 h-[1px] w-full mt-8 mb-1"></div>
                    <p className="text-md m-4 mb-5">Or start a new chat</p>
                    <Button
                        variant="outline"
                        className="text-[#977df5] p-2 rounded-md mt-0 w-full font-bold"
                        onClick={newChat}
                    >
                        New Chat
                    </Button>
                </div>
            </div>
        </div>
    )
}
