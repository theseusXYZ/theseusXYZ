import { useState, useEffect } from 'react'
import OnboardingModal from '@/components/modals/onboarding-modal'
import SelectProjectDirectoryModal from '@/components/modals/select-project-directory-modal'
import { useSafeStorage } from './lib/services/safeStorageService'
import Chat from '@/panels/chat/chat-panel'
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from '@/components/ui/resizable'
import EditorPanel from '@/panels/editor/editor-panel'
import { SessionMachineContext } from '@/contexts/session-machine-context'
import GitErrorModal from '@/components/modals/git-error-modal'
import GitInitModal, { GitAskModal, GitCorruptedModal, GitMergeResultModal } from '@/components/modals/git-init-modal'
import Sidebar from '@/components/sidebar/sidebar'

export default function Landing({
    smHealthCheckDone,
    setSmHealthCheckDone,
}: {
    smHealthCheckDone: boolean
    setSmHealthCheckDone: (value: boolean) => void
}) {
    const { checkHasEncryptedData, getUseModelName, getApiKey } =
        useSafeStorage()
    const [modelName, setModelName] = useState('')
    const [justOnboarded, setOnboarded] = useState(false)
    const [hasKey, setHasKey] = useState(false)

    useEffect(() => {
        const check = async () => {
            const hasEncryptedData = await checkHasEncryptedData()
            if (hasEncryptedData) {
                const modelName = await getUseModelName()
                setModelName(modelName)
                const _key = await getApiKey(modelName)
                if (_key) {
                    setHasKey(true)
                }
            }
        }
        check()
    }, [checkHasEncryptedData])

    const sessionActorref = SessionMachineContext.useActorRef()
    // sessionActorref.subscribe(state => {
    //     console.log('STATE', state.value)
    // })
    const state = SessionMachineContext.useSelector(
        state => state,
        (a, b) => a.value === b.value
    )

    async function afterOnboard(
        apiKey: string,
        _modelName: string,
        folderPath: string
    ) {
        sessionActorref.send({
            type: 'session.create',
            payload: {
                path: folderPath,
                agentConfig: {
                    model: _modelName,
                    api_key: apiKey,
                },
            },
        })
        sessionActorref.on('session.creationComplete', () => {
            sessionActorref.send({
                type: 'session.init',
                payload: {
                    // path: folderPath,
                    agentConfig: {
                        model: _modelName,
                        api_key: apiKey,
                    },
                },
            })
        })
    }

    if (
        !smHealthCheckDone &&
        state &&
        !state.matches({ setup: 'healthcheck' })
    ) {
        setSmHealthCheckDone(true)
        if (state.context.healthcheckRetry >= 10) {
            alert(
                `Application failed health check\n\nRetries: ${state.context.healthcheckRetry}\n\nPlease report / find more info on this issue here:\nhttps://github.com/entropy-research/theseus/issues`
            )
        }
    }
    const [expanded, setExpanded] = useState(false)
    const [showMinimizedTimeline, setShowMinimizedTimeline] = useState(false)

    return (
        <>
            <div className="w-full flex flex-row">
                <Sidebar
                    expanded={expanded}
                    setExpanded={setExpanded}
                    showMinimizedTimeline={showMinimizedTimeline}
                    setShowMinimizedTimeline={setShowMinimizedTimeline}
                />
                <ResizablePanelGroup direction="horizontal">
                    <ResizablePanel
                        className={`flex flex-col w-full relative justify-center`}
                    >
                        {/* <SidebarItem
                        text="Settings"
                        icon={<Settings className="text-primary" />}
                        active={true}
                        alert={false}
                        route="/settings"
                        expanded={true}
                    /> */}
                        <Chat sessionId={'UI'} />
                    </ResizablePanel>
                    <ResizableHandle
                        className={`${
                            expanded || !showMinimizedTimeline ? 'w-0' : 'w-8'
                        } transition-all duration-200 ease-in-out`}
                    />
                    <ResizablePanel className="flex-col w-full hidden md:flex">
                        <EditorPanel chatId={'UI'} />
                    </ResizablePanel>
                </ResizablePanelGroup>
            </div>
            <GitErrorModal />
            <GitInitModal />
            <GitAskModal />
            <GitCorruptedModal />
            <GitMergeResultModal />

            {smHealthCheckDone && !modelName && (
                <OnboardingModal
                    setModelName={setModelName}
                    setOnboarded={setOnboarded}
                    afterOnboard={afterOnboard}
                />
            )}
            <div className="dark">
                {smHealthCheckDone && !justOnboarded && modelName && (
                    <SelectProjectDirectoryModal
                        openProjectModal={
                            !state.can({ type: 'session.toggle' }) &&
                            !state.matches('resetting')
                        }
                        hideclose
                        sessionActorref={sessionActorref}
                        state={state}
                        model={modelName}
                    />
                )}
            </div>
        </>
    )
}
