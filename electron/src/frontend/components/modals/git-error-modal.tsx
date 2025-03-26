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
import { AlertTriangle } from 'lucide-react'

const GitErrorModal = () => {
    const [isOpen, setIsOpen] = useState(false)
    const unresolvedGitError = SessionMachineContext.useSelector(
        state => state.context.serverEventContext.gitError
    )
    const sessionActorRef = SessionMachineContext.useActorRef()

    useEffect(() => {
        if (unresolvedGitError) {
            setIsOpen(true)
        }
    }, [unresolvedGitError])

    const handleResolve = () => {
        sessionActorRef.send({
            type: 'session.sendEvent',
            params: {
                serverEventType: 'GitResolve',
                content: { action: 'retry' },
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

    if (!unresolvedGitError) {
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
                        <div className="flex items-center gap-2 text-red-500">
                            <AlertTriangle size={20} className="mb-[2px]" />
                            <h2 className="text-xl font-semibold">Git error</h2>
                        </div>
                    </DialogTitle>
                    <DialogDescription asChild>
                        <p className="text-sm text-gray-400 mt-2 leading-relaxed tracking-wide">
                            {unresolvedGitError}
                        </p>
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-4 mt-1">
                    <p className="text-sm">
                        There was a problem with git. How would you like to
                        proceed?
                    </p>
                    <div className="flex flex-col gap-3 mt-2">
                        <Button
                            className="w-full py-2 rounded transition-colors"
                            onClick={handleResolve}
                        >
                            I've resolved this issue
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

export default GitErrorModal
