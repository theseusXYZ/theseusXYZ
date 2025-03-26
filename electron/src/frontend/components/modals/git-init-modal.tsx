import React, { useState, useEffect } from 'react'
import { SessionMachineContext } from '@/contexts/session-machine-context'
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogHeader,
    DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Icon } from '@iconify/react'

const GitInitModal = () => {
    const [isOpen, setIsOpen] = useState(false)
    const gitInitMsg = SessionMachineContext.useSelector(
        state => state.context.serverEventContext.gitInit
    )
    const sessionActorRef = SessionMachineContext.useActorRef()

    useEffect(() => {
        if (gitInitMsg) {
            setIsOpen(true)
        }
    }, [gitInitMsg])

    const handleInitRepo = () => {
        sessionActorRef.send({
            type: 'session.sendEvent',
            params: {
                serverEventType: 'GitResolve',
                content: { action: 'git' },
            },
        })
        setIsOpen(false)
    }

    const handleContinueWithoutGit = () => {
        sessionActorRef.send({
            type: 'session.sendEvent',
            params: {
                serverEventType: 'GitResolve',
                content: { action: 'nogit' },
            },
        })
        setIsOpen(false)
    }

    if (!gitInitMsg) {
        return null
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent
                hideclose={true.toString()}
                className="sm:max-w-[425px] pb-4"
            >
                <DialogHeader>
                    <DialogTitle>
                        <div className="flex items-center gap-2 whitespace-nowrap">
                            <Icon
                                icon="vscode-icons:file-type-git"
                                className="h-[24px] w-[24px]"
                            />
                            <h2 className="text-xl font-semibold">
                                Initialize git repository?
                            </h2>
                        </div>
                    </DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4 mt-1">
                    <p className="text-sm">{gitInitMsg}</p>
                    <div className="flex flex-col gap-3 mt-2">
                        <Button
                            className="w-full py-2 rounded transition-colors"
                            onClick={handleInitRepo}
                        >
                            Initialize git repository
                        </Button>
                        <Button
                            variant="ghost"
                            className="w-full rounded transition-colors text-gray-500 hover:text-red-500 hover:border-2 hover:bg-transparent hover:border-red-500"
                            onClick={handleContinueWithoutGit}
                        >
                            Continue without git
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export default GitInitModal

const GitAskModal = () => {
    const [isOpen, setIsOpen] = useState(false)
    const gitInitMsg = SessionMachineContext.useSelector(
        state => state.context.serverEventContext.gitMessage
    )
    const gitOptions = SessionMachineContext.useSelector(
        state => state.context.serverEventContext.gitMessage?.options ?? ["Yes","No"]
    )
    const gitMessage = SessionMachineContext.useSelector(
        state => state.context.serverEventContext.gitMessage?.message ?? ""
    )
    const sessionActorRef = SessionMachineContext.useActorRef()

    useEffect(() => {
        if (gitMessage) {
            setIsOpen(true)
        }
    }, [gitMessage])

    const handleYes = () => {
        sessionActorRef.send({
            type: 'session.sendEvent',
            params: {
                serverEventType: 'GitResolve',
                content: { action: 'yes' },
            },
        })
        setIsOpen(false)
    }

    const handleNo = () => {
        sessionActorRef.send({
            type: 'session.sendEvent',
            params: {
                serverEventType: 'GitResolve',
                content: { action: 'no' },
            },
        })
        setIsOpen(false)
    }

    if (!gitMessage) {
        return null
    }

    console.log(gitMessage,)


    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent
                hideclose={true.toString()}
                className="sm:max-w-[425px] pb-4"
            >
                <DialogHeader>
                    <DialogTitle>
                        <div className="flex items-center gap-2">
                            <div className="flex-shrink-0 self-start mt-[3px]">
                                <Icon
                                    icon="vscode-icons:file-type-git"
                                    className="h-6 w-6"
                                />
                            </div>
                            <h2 className="text-xl font-semibold">
                                {gitMessage}
                            </h2>
                        </div>
                    </DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4 mt-1">
                    <p className="text-sm">{gitMessage}</p>
                    <div className="flex flex-col gap-3 mt-2">
                        <Button
                            className="w-full py-2 rounded transition-colors"
                            onClick={handleYes}
                        >
                            {gitOptions[0]}
                        </Button>
                        <Button
                            variant="ghost"
                            className="w-full rounded transition-colors text-gray-500 hover:text-red-500 hover:border-2 hover:bg-transparent hover:border-red-500"
                            onClick={handleNo}
                        >
                            {gitOptions[1]}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export { GitAskModal }


const GitCorruptedModal = () => {
    const [isOpen, setIsOpen] = useState(false)
    const gitCorrupted = SessionMachineContext.useSelector(
        state => state.context.serverEventContext.gitCorrupted
    )
    const sessionActorRef = SessionMachineContext.useActorRef()

    useEffect(() => {
        if (gitCorrupted) {
            setIsOpen(true)
        }
    }, [gitCorrupted])

    const handleOk = () => {
        sessionActorRef.send({
            type: 'session.sendEvent',
            params: {
                serverEventType: 'GitCorruptedResolved',
                content: { action: 'yes' },
            },
        })
        sessionActorRef.send({
            type: 'session.reset',
        })
        setIsOpen(false)
    }

    if (!gitCorrupted) {
        return null
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent
                hideclose={true.toString()}
                className="sm:max-w-[425px] pb-4"
            >
                <DialogHeader>
                    <DialogTitle>
                        <div className="flex items-center gap-2">
                            <div className="flex-shrink-0 self-start mt-[3px]">
                                <Icon
                                    icon="vscode-icons:file-type-git"
                                    className="h-6 w-6"
                                />
                            </div>
                            <h2 className="text-xl font-semibold">
                                Session corrupted
                            </h2>
                        </div>
                    </DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4 mt-1">
                    <p className="text-sm">Your old session git versioning seems to be curropted. theseus will start a new session.</p>
                    <div className="flex flex-col gap-3 mt-2">
                        <Button
                            className="w-full py-2 rounded transition-colors"
                            onClick={handleOk}
                        >
                            Ok
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export { GitCorruptedModal }


const GitMergeResultModal = () => {
    const [isOpen, setIsOpen] = useState(false)
    const gitMergeResult = SessionMachineContext.useSelector(
        state => state.context.serverEventContext.gitMergeResult
    )
    const sessionActorRef = SessionMachineContext.useActorRef()

    useEffect(() => {
        if (gitMergeResult) {
            setIsOpen(true)
        }
    }, [gitMergeResult])

    const handleOk = () => {
        sessionActorRef.send({
            type: 'session.sendEvent',
            params: {
                serverEventType: 'GitMergeResolve',
                content : {}
            },
        })
        setIsOpen(false)
    }

    if (!gitMergeResult) {
        return null
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent
                hideclose={true.toString()}
                className="sm:max-w-[425px] pb-4"
            >
                <DialogHeader>
                    <DialogTitle>
                        <div className="flex items-center gap-2">
                            <div className="flex-shrink-0 self-start mt-[3px]">
                                <Icon
                                    icon="vscode-icons:file-type-git"
                                    className="h-6 w-6"
                                />
                            </div>
                            <h2 className="text-xl font-semibold">
                                Merge Failed
                            </h2>
                        </div>
                    </DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4 mt-1">
                    <p className="text-sm">Unable to merge. {gitMergeResult.message}</p>
                    <div className="flex flex-col gap-3 mt-2">
                        <Button
                            className="w-full py-2 rounded transition-colors"
                            onClick={handleOk}
                        >
                            Ok
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export { GitMergeResultModal }
