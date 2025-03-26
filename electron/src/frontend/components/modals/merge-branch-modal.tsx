import { useState, useEffect } from 'react'
import { SessionMachineContext } from '@/contexts/session-machine-context'
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogHeader,
    DialogDescription,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Icon } from '@iconify/react'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/components/ui/use-toast'

const MergeBranchModal = ({
    trigger,
    branchName,
}: {
    trigger: JSX.Element
    branchName: string
}) => {
    const [open, setOpen] = useState(false)
    const [commitMessage, setCommitMessage] = useState('')
    const { toast } = useToast()
    const [useDefaultCommitMessage, setUseDefaultCommitMessage] =
        useState(false)
    const sessionActorRef = SessionMachineContext.useActorRef()
    const defaultCommitMessage = `Merge branch 'theseus_agent' into ${branchName}`
    const successMessage = `Current changes now synced with ${branchName}`// `Merged branch 'theseus_agent' into ${branchName}`

    useEffect(() => {
        const loadUserSettings = async () => {
            const res = await window.api.invoke(
                'get-user-setting',
                'git.merge-use-default-commit-message'
            )
            if (res.success) {
                setUseDefaultCommitMessage(res.data)
                if (res.data) {
                    setCommitMessage(defaultCommitMessage)
                }
            }
        }
        if (open && branchName) {
            loadUserSettings()
        }
    }, [branchName, open])

    function handleGitMerge() {
        setCommitMessage('')
        sessionActorRef.send({
            type: 'session.sendEvent',
            params: {
                serverEventType: 'GitMerge',
                content: {
                    commit_message: commitMessage.trim(),
                },
            },
        })
        toast({
            title: successMessage,
        })
        setOpen(false)
    }
    const handleCommitMessageChange = (
        e: React.ChangeEvent<HTMLInputElement>
    ) => {
        setCommitMessage(e.target.value)
    }

    async function handleUseDefaultCommitMessageChange(
        e: React.ChangeEvent<HTMLInputElement>
    ) {
        const checked = Boolean(e)
        setUseDefaultCommitMessage(checked)
        setCommitMessage(checked ? defaultCommitMessage : '')
        const data = {
            setting: 'git',
            key: 'merge-use-default-commit-message',
            value: Boolean(checked),
        }
        const response = await window.api.invoke('set-user-setting', data)
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{trigger}</DialogTrigger>
            <DialogContent className="sm:max-w-[425px] w-[425px]">
                <DialogHeader>
                    <DialogTitle>
                        <div className="flex items-center gap-2 whitespace-nowrap">
                            <Icon
                                icon="vscode-icons:file-type-git"
                                className="h-[24px] w-[24px]"
                            />
                            <h2 className="text-xl font-semibold">
                                Merge changes into
                                <code className="bg-black px-[6px] py-[2px] rounded-md text-primary text-opacity-100 text-[1.1rem] mx-[4px] leading-relaxed tracking-wide">
                                    {branchName
                                        ? branchName
                                        : '(name not found)'}
                                </code>
                                ?
                            </h2>
                        </div>
                    </DialogTitle>
                    <DialogDescription asChild>
                        <p className="text-sm text-gray-400 mt-2 leading-relaxed tracking-wide"></p>
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-3 mt-1">
                    <p className="-mb-1">Enter a commit message</p>
                    <Input
                        placeholder={'Commit message for merge'}
                        className="bg-midnight"
                        value={commitMessage}
                        onChange={handleCommitMessageChange}
                    />
                    <div className="flex items-center space-x-2 ml-auto">
                        <Checkbox
                            id="use-default-commit-message"
                            checked={useDefaultCommitMessage}
                            onCheckedChange={
                                handleUseDefaultCommitMessageChange
                            }
                        />
                        <label
                            htmlFor="use-default-commit-message"
                            className={`hover:cursor-pointer text-sm transition-colors duration-200 ${
                                useDefaultCommitMessage
                                    ? 'text-white'
                                    : 'text-gray-400 hover:text-white'
                            }`}
                        >
                            Use default message
                        </label>
                    </div>
                    <div className="flex flex-col gap-3 mt-4">
                        <Button
                            className="w-full py-2 rounded transition-colors"
                            onClick={handleGitMerge}
                            disabled={!Boolean(commitMessage.trim())}
                        >
                            Commit to{' '}
                            <pre className="mx-[4px] leading-relaxed tracking-wide font-semibold self-end">
                                {branchName ? branchName : '(name not found)'}
                            </pre>
                        </Button>
                        {/* <Button
                            variant="ghost"
                            className="w-full rounded transition-colors text-gray-500 hover:text-red-500 hover:border-2 hover:bg-transparent hover:border-red-500"
                            onClick={handleContinueWithoutGit}
                        >
                            Cancel
                        </Button> */}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export default MergeBranchModal
