import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CardHeader, CardContent, Card } from '@/components/ui/card'
import { Checkbox, CheckedState } from '@/components/ui/checkbox'
import { useToast } from '@/components/ui/use-toast'
import { useSafeStorage } from '@/lib/services/safeStorageService'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import { CircleHelp, Settings, Info } from 'lucide-react'
import SafeStoragePopoverContent from '@/components/modals/safe-storage-popover-content'
import { Skeleton } from '@/components/ui/skeleton'
import { Model, AgentConfig, UpdateConfig } from '@/lib/types'
import {
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogTitle,
    DialogHeader,
    DialogDescription,
} from '@/components/ui/dialog'
import Combobox, { ComboboxItem } from '@/components/ui/combobox'
import { SessionMachineContext } from '@/contexts/session-machine-context'
import FolderPicker from '@/components/ui/folder-picker'
import * as VisuallyHidden from '@radix-ui/react-visually-hidden'
import axios from 'axios'
import { updateSessionConfig } from '@/lib/services/sessionService/sessionService'
import { savedFolderPathAtom } from '@/lib/utils'
import { useAtom } from 'jotai'
import { useModels, addModel, removeModel } from '@/lib/models'

const SettingsModal = ({
    trigger,
    isOpen,
    setIsOpen,
}: {
    trigger: JSX.Element
    isOpen?: boolean
    setIsOpen?: (isOpen: boolean) => void
}) => {
    const [internalOpen, setInternalOpen] = useState(false)

    const open = isOpen !== undefined ? isOpen : internalOpen
    const setOpen = setIsOpen || setInternalOpen
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{trigger}</DialogTrigger>

            <DialogContent className="w-[500px]">
                <VisuallyHidden.Root>
                    <DialogHeader>
                        <DialogTitle>Settings</DialogTitle>
                    </DialogHeader>
                    <DialogDescription></DialogDescription>
                </VisuallyHidden.Root>
                <General setOpen={setOpen} open={open} />
            </DialogContent>
        </Dialog>
    )
}

const General = ({
    setOpen,
    open,
}: {
    setOpen: (val: boolean) => void
    open: boolean
}) => {
    const { toast } = useToast()
    const {
        models,
        comboboxItems,
        selectedModel,
        setSelectedModel,
        refetchModels,
        backupModel,
    } = useModels()

    // Checking model
    const {
        checkHasEncryptedData,
        getUseModelName,
        deleteData,
        setUseModelName,
        getApiKey,
    } = useSafeStorage()
    const sessionActorref = SessionMachineContext.useActorRef()
    const path = SessionMachineContext.useSelector(
        state => state?.context?.sessionConfig?.path
    )
    const host = SessionMachineContext.useSelector(state => state.context.host)
    const name = SessionMachineContext.useSelector(state => state.context.name)

    const [originalModelName, setOriginalModelName] = useState(
        selectedModel?.id
    )
    const [modelHasSavedApiKey, setModelHasSavedApiKey] = useState(false)
    const [folderPath, setFolderPath] = useState('')
    const [initialFolderPath, setInitialFolderPath] = useState<{
        loading: boolean
        value: string | null
    }>({
        loading: true,
        value: null,
    })
    const [hasClickedQuestion, setHasClickedQuestion] = useState(false)
    const [_, setSavedFolderPath] = useAtom(savedFolderPathAtom)
    const { removeApiKey } = useSafeStorage()
    const clearStorageAndResetSession = () => {
        deleteData()
        toast({ title: 'Storage cleared!' })
        sessionActorref.send({ type: 'session.delete' })
    }

    useEffect(() => {
        if (!path) {
            return
        }
        setFolderPath(path)
        if (!initialFolderPath.value) {
            setInitialFolderPath({
                loading: false,
                value: path,
            })
        }
    }, [path])

    useEffect(() => {
        const check = async () => {
            const hasEncryptedData = await checkHasEncryptedData()
            if (hasEncryptedData) {
                const modelName: string = await getUseModelName()
                if (modelName) {
                    const foundModel = models.find(
                        model => model.id === modelName
                    )
                    if (foundModel) {
                        const extendedComboboxModel = {
                            ...foundModel,
                            value: foundModel.id,
                            label: foundModel.name,
                        }
                        setSelectedModel(extendedComboboxModel)
                        setOriginalModelName(modelName)
                    }
                }
            }
        }
        check()
    }, [open, models?.length])

    const fetchApiKey = useCallback(async () => {
        if (!selectedModel) return
        const res = await getApiKey(selectedModel.id)
        return res
    }, [selectedModel?.id])

    async function handleUseNewModel() {
        if (!selectedModel) return
        await setUseModelName(selectedModel.id, false)
        refetchModels(true)
        setOpen(false)
        const _key: string = await fetchApiKey()
        const config: UpdateConfig = {
            api_key: _key,
            model: selectedModel.id,
        }
        await updateSessionConfig(host, name, config)
    }

    function handleChangePath() {
        if (folderPath === initialFolderPath.value) {
            sessionActorref.send({ type: 'session.reset' })
        } else {
            setSavedFolderPath(folderPath)
            sessionActorref.send({ type: 'session.delete' })
        }
        setOpen(false)
    }

    // use this when we implement the change directory button
    function handleNewChat() {
        if (!selectedModel) return
        async function updateMachine() {
            sessionActorref.send({
                type: 'session.create',
                payload: {
                    path: folderPath,
                    agentConfig: {
                        model: selectedModel.id,
                        api_key: _key,
                    },
                },
            })
            sessionActorref.on('session.creationComplete', () => {
                sessionActorref.send({
                    type: 'session.init',
                    payload: {
                        // path: folderPath,
                        agentConfig: {
                            model: selectedModel.id,
                            api_key: _key,
                        },
                    },
                })
            })
        }
        sessionActorref.send({ type: 'session.delete' })
        setUseModelName(selectedModel.id)
        const _key = fetchApiKey()
        setOpen(false)
    }

    async function handleDeleteCurrentCustomModel() {
        if (!selectedModel) return
        
        removeModel(selectedModel)
        removeApiKey(selectedModel.id, false)
        if (originalModelName === selectedModel.id) {
            setSelectedModel(null)
            await setUseModelName(backupModel.id, false)
        }
        setOpen(false)
    }

    return (
        <div className="pt-4 pb-2 px-2 flex flex-col gap-5">
            <GeneralSettingsCard
                folderPath={folderPath}
                setFolderPath={setFolderPath}
                handleChangePath={handleChangePath}
                initialFolderPath={initialFolderPath}
                handleNewChat={handleNewChat}
            />
            <Card className="bg-midnight">
                <CardContent>
                    <div className="flex flex-col mt-5 w-full mb-4">
                        <div className="flex items-center justify-between">
                            <p className="text-lg font-semibold">
                                {selectedModel?.id === 'custom'
                                    ? 'Add a custom model:'
                                    : selectedModel?.id !== originalModelName
                                    ? `Set new model: `
                                    : `Current model:`}
                            </p>
                            <div className="flex flex-col">
                                {selectedModel && (
                                    <Combobox
                                        items={comboboxItems}
                                        itemType="model"
                                        selectedItem={selectedModel}
                                        setSelectedItem={setSelectedModel}
                                    />
                                )}
                            </div>
                        </div>
                        {selectedModel?.value !== 'claude-3-5-sonnet' &&
                            selectedModel?.id !== 'custom' && (
                                <span className="text-sm text-green-500 mt-2 flex gap-1 items-center">
                                    <Info className="w-4 h-4" />
                                    Note: For best results use Claude 3.5 Sonnet
                                    (it's better at coding!)
                                </span>
                            )}
                    </div>
                    {selectedModel?.id === 'custom' ? (
                        <EnterCustomModel
                            setHasClickedQuestion={setHasClickedQuestion}
                            setOpen={setOpen}
                            setModelHasSavedApiKey={setModelHasSavedApiKey}
                            refetchModels={refetchModels}
                        />
                    ) : (
                        <>
                            <div className="flex justify-between w-full">
                                <div className="flex gap-1 items-center mb-4 w-full">
                                    <p className="text-xl font-bold">
                                        {`${
                                            selectedModel?.company
                                                ? selectedModel?.company
                                                : selectedModel?.id
                                        } API Key`}
                                    </p>
                                    <Popover>
                                        <PopoverTrigger
                                            className="ml-[2px]"
                                            onClick={() =>
                                                setHasClickedQuestion(true)
                                            }
                                        >
                                            <CircleHelp size={14} />
                                        </PopoverTrigger>
                                        <SafeStoragePopoverContent />
                                    </Popover>
                                    {hasClickedQuestion &&
                                        !modelHasSavedApiKey &&
                                        selectedModel?.apiKeyUrl && (
                                            <a
                                                className="text-primary hover:underline self-end ml-auto cursor-pointer"
                                                href={selectedModel.apiKeyUrl}
                                                target="_blank"
                                            >
                                                Looking for an API key?
                                            </a>
                                        )}
                                </div>
                                {selectedModel?.id !== originalModelName &&
                                    modelHasSavedApiKey && (
                                        <Button onClick={handleUseNewModel}>
                                            {'Use this model'}
                                        </Button>
                                    )}
                            </div>
                            {selectedModel && (
                                <APIKeyComponent
                                    model={selectedModel}
                                    setModelHasSavedApiKey={
                                        setModelHasSavedApiKey
                                    }
                                    setOpen={setOpen}
                                    refetchModels={refetchModels}
                                />
                            )}
                            {selectedModel && selectedModel.apiBaseUrl && (
                                <p
                                    className="mt-2 text-gray-500 text-xs text-ellipsis max-w-[400px]"
                                    title={selectedModel.apiBaseUrl}
                                >
                                    API Base: {selectedModel.apiBaseUrl}
                                </p>
                            )}
                            {selectedModel && selectedModel.isCustom && (
                                <Button
                                    variant="outline-thin"
                                    className="w-full mt-6"
                                    onClick={handleDeleteCurrentCustomModel}
                                >
                                    Delete this model
                                </Button>
                            )}
                        </>
                    )}
                    {/* <Input
                        className="w-full"
                        type="password"
                        value={123}
                        // onChange={handleApiKeyInputChange}
                        // disabled={!isChecked || isKeySaved}
                    /> */}
                </CardContent>
            </Card>
            {/* <Card className="bg-midnight">
                <CardHeader>
                    <div className="flex items-center -mb-2">
                        <CardTitle>API Keys</CardTitle>
                        <Popover>
                            <PopoverTrigger className="ml-2 mb-2">
                                <CircleHelp size={20} />
                            </PopoverTrigger>
                            <SafeStoragePopoverContent />
                        </Popover>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-6">
                        {models.map((model: Model) => (
                            <APIKeyComponent key={model.id} model={model} />
                        ))}
                    </div>
                </CardContent>
            </Card> */}
            {selectedModel?.id !== 'custom' ? (
                <>
                    <VersionControlSettingsCard />
                    <MiscellaneousCard
                        clearStorageAndResetSession={
                            clearStorageAndResetSession
                        }
                    />
                </>
            ) : null}
        </div>
    )
}

const APIKeyComponent = ({
    model,
    setModelHasSavedApiKey,
    setOpen,
    simple = false,
    disabled = false,
    isCustom = false,
    refetchModels,
}: {
    model: Model
    setModelHasSavedApiKey: (value: boolean) => void
    setOpen: (value: boolean) => void
    simple?: boolean
    disabled?: boolean
    isCustom?: boolean
    refetchModels: (delay?: boolean) => void
}) => {
    const { addApiKey, getApiKey, removeApiKey, setUseModelName } =
        useSafeStorage()
    const [key, setKey] = useState('')
    const [isKeyStored, setIsKeyStored] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const host = SessionMachineContext.useSelector(state => state.context.host)
    const name = SessionMachineContext.useSelector(state => state.context.name)

    const fetchApiKey = useCallback(async () => {
        if (model.comingSoon) {
            setIsLoading(false)
            return
        }
        setIsLoading(true)
        const res = await getApiKey(model.id)
        if (res) {
            setKey(res)
            setIsKeyStored(true)
            setModelHasSavedApiKey(true)
        } else {
            setIsKeyStored(false)
            setModelHasSavedApiKey(false)
            setKey('')
        }
        setIsLoading(false)
    }, [model.id])

    useEffect(() => {
        fetchApiKey()
    }, [model.id])

    const handleSave = async () => {
        setIsSaving(true)
        await addApiKey(model.id, key, false)
        // Update the model as well
        await setUseModelName(model.id, false)
        refetchModels(true)
        const config: UpdateConfig = {
            api_key: key,
            model: model.id,
        }
        if (isCustom) {
            addModel(model)
        }
        setOpen(false)
        setIsSaving(false)
        setIsKeyStored(true)
        await updateSessionConfig(host, name, config)
    }

    const handleDelete = async () => {
        setIsSaving(true)
        await removeApiKey(model.id, false)
        setIsKeyStored(false)
        const newKey = ''
        setKey(newKey)
        const config: UpdateConfig = {
            api_key: newKey,
            model: model.id,
        }
        setIsSaving(false)
        await updateSessionConfig(host, name, config)
    }

    return (
        <div>
            {!simple && (
                <div className="flex items-center mb-2">
                    <p className="text-lg">{model.name}</p>
                    {model.comingSoon && (
                        <p className="text-md px-2 text-neutral-500">
                            (Coming soon!)
                        </p>
                    )}
                </div>
            )}
            {isLoading ? (
                <Skeleton className="h-10 w-full" />
            ) : isKeyStored ? (
                <div className="flex gap-4">
                    <Input
                        type="password"
                        value="**********************"
                        disabled
                    />
                    <Button
                        disabled={model.comingSoon || isSaving}
                        onClick={handleDelete}
                        variant="outline-thin"
                    >
                        {isSaving ? 'Deleting...' : 'Delete API Key'}
                    </Button>
                </div>
            ) : (
                <div className="flex gap-4">
                    <Input
                        id={model.id}
                        disabled={model.comingSoon || isSaving}
                        placeholder={`${
                            model.company ? model.company : 'Model'
                        } API Key`}
                        type="password"
                        value={key}
                        onChange={e => setKey(e.target.value)}
                    />
                    {key.length > 0 && (
                        <Button
                            disabled={model.comingSoon || isSaving || disabled}
                            onClick={handleSave}
                        >
                            {/* {isSaving ? 'Saving...' : 'Save'} */}
                            {isSaving ? 'Saving...' : 'Save and use'}
                        </Button>
                    )}
                </div>
            )}
        </div>
    )
}

export default SettingsModal

const GeneralSettingsCard = ({
    folderPath,
    setFolderPath,
    handleChangePath,
    initialFolderPath,
}: // handleNewChat
{
    folderPath: string
    setFolderPath: (path: string) => void
    handleChangePath: (path: string) => void
    initialFolderPath: {
        loading: boolean
        value: string
    }
    // handleNewChat: () => void
}) => {
    return (
        <Card className="bg-midnight">
            <CardContent className="mt-5 w-full">
                <p className="text-lg font-semibold mb-4">
                    {`Project directory:`}
                </p>
                <FolderPicker
                    folderPath={folderPath}
                    setFolderPath={setFolderPath}
                    showTitle={false}
                    // customButton={
                    //     <Button onClick={() => handleChangePath(folderPath)}>Change</Button>
                    // }
                />
                {!initialFolderPath.loading &&
                    initialFolderPath.value !== folderPath && (
                        <Button
                            className="mt-5 w-full"
                            onClick={handleChangePath}
                        >
                            Start new chat
                        </Button>
                    )}
            </CardContent>
        </Card>
    )
}

const VersionControlSettingsCard = () => {
    const [useGit, setUseGit] = useState<CheckedState>(true)
    const [createNewBranch, setCreateNewBranch] = useState<CheckedState>(true)
    const [config, setConfig] = useState<AgentConfig | null>(null)
    const { toast } = useToast()

    useEffect(() => {
        const loadUserSettings = async () => {
            const res = await window.api.invoke(
                'get-user-setting',
                'git.enabled'
            )
            if (res.success) {
                setUseGit(res.data)
            }
            const res2 = await window.api.invoke(
                'get-user-setting',
                'git.create-new-branch'
            )
            if (res2.success) {
                setCreateNewBranch(res2.data)
            }
        }
        loadUserSettings()
    }, [])

    const handleMerge = () => {
        // TODO: Implement merge logic
        console.log('Attempting to merge...')
        // If merge fails, show an error message
        toast({
            title: 'Merge failed',
            description:
                'There are merge conflicts. Please resolve them in your editor and try again.',
            variant: 'destructive',
        })
    }

    async function handleUseGitChange(checked: boolean) {
        setUseGit(checked)
        const data = {
            setting: 'git',
            key: 'enabled',
            value: Boolean(checked),
        }
        const response = await window.api.invoke('set-user-setting', data)
    }

    async function handleCreateNewBranch(checked: boolean) {
        setCreateNewBranch(checked)
        const data = {
            setting: 'git',
            key: 'create-new-branch',
            value: Boolean(checked),
        }
        const response = await window.api.invoke('set-user-setting', data)
    }

    const host = SessionMachineContext.useSelector(state => state.context.host)
    const name = SessionMachineContext.useSelector(state => state.context.name)

    const getSessionConfig = async () => {
        try {
            const response = await axios.get(`${host}/sessions/${name}/config`)
            return response.data
        } catch (error) {
            console.error('Error fetching session config:', error)
            throw error
        }
    }

    useEffect(() => {
        getSessionConfig().then(res => setConfig(res))
    }, [])

    return (
        <Card className="bg-midnight">
            <CardContent className="mt-5 w-full">
                <div className="flex gap-1 items-center mb-4 w-full">
                    <h3 className="text-lg font-semibold">Version control</h3>
                    <Popover>
                        <PopoverTrigger className="ml-[2px]">
                            <CircleHelp size={14} />
                        </PopoverTrigger>
                        <PopoverContent
                            side="top"
                            className="bg-night w-fit p-2 px-3"
                        >
                            Enabling this means you can revert and step back to
                            previous versions
                        </PopoverContent>
                    </Popover>
                </div>
                <div className="flex flex-col gap-4">
                    <div className="flex items-center space-x-2">
                        <Checkbox
                            id="use-git"
                            checked={useGit}
                            onCheckedChange={handleUseGitChange}
                        />
                        <label
                            htmlFor="use-git"
                            className="hover:cursor-pointer"
                        >
                            Use git as version control system
                        </label>
                    </div>
                    {/* <div
                        className={`flex flex-col gap-4 ${
                            !useGit ? 'opacity-50 hover:cursor-not-allowed' : ''
                        }`}
                    >
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="create-branch"
                                checked={createNewBranch}
                                onCheckedChange={handleCreateNewBranch}
                                disabled={!useGit}
                            />
                            <label
                                htmlFor="create-branch"
                                className={
                                    !useGit
                                        ? 'pointer-events-none'
                                        : 'hover:cursor-pointer'
                                }
                            >
                                Create a new branch when starting a new session
                            </label>
                        </div>
                    </div> */}
                    {((useGit && config?.versioning_type !== 'git') ||
                        (!useGit && config?.versioning_type === 'git')) && (
                        <span className="text-sm text-green-500 mt-0 flex gap-1 items-center">
                            <Info className="w-4 h-4" />
                            Note: Changes will apply once a new session is
                            created
                        </span>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}

const MiscellaneousCard = ({
    clearStorageAndResetSession,
}: {
    clearStorageAndResetSession: () => void
}) => {
    return (
        <Card className="bg-midnight">
            <CardHeader>
                <div className="flex gap-1 items-center">
                    <h2 className="text-lg font-semibold">Miscellaneous</h2>
                    <Popover>
                        <PopoverTrigger className="ml-[2px]">
                            <CircleHelp size={14} />
                        </PopoverTrigger>
                        <PopoverContent
                            side="top"
                            className="bg-night w-fit p-2 px-3"
                        >
                            Clears your keys from Electron Safe Storage and
                            clears the session
                        </PopoverContent>
                    </Popover>
                </div>
            </CardHeader>
            <CardContent>
                <Button className="w-fit" onClick={clearStorageAndResetSession}>
                    Clear Storage
                </Button>
            </CardContent>
        </Card>
    )
}

const EnterCustomModel = ({
    setOpen,
    setModelHasSavedApiKey,
    refetchModels,
}: {
    setOpen: (v: boolean) => void
    setModelHasSavedApiKey: (v: boolean) => void
    refetchModels: (delay?: boolean) => void
}) => {
    const [customModel, setCustomModel] = useState<Model>({
        id: '',
        name: '',
        company: '',
    })

    function handleSetCustomModel(field: keyof Model, value: string) {
        setCustomModel(prev => ({ ...prev, [field]: value }))
    }

    return (
        <div className="flex flex-col gap-5">
            <div>
                <div className="flex items-center mb-2 gap-1">
                    <p className="text-lg">LiteLLM Model</p>
                    <Popover>
                        <PopoverTrigger className="ml-[2px]">
                            <CircleHelp size={14} />
                        </PopoverTrigger>
                        <PopoverContent
                            side="top"
                            className="bg-night w-fit p-2 px-3 hover:border-primary cursor-pointer hover:bg-batman transition-colors duration-300"
                            onClick={
                                () =>
                                    window.open(
                                        'https://litellm.vercel.app/docs/providers/openai_compatible'
                                    )
                            }
                        >
                            Where do I find this?
                        </PopoverContent>
                    </Popover>
                </div>
                <Input
                    value={customModel.id}
                    onChange={e => {
                        handleSetCustomModel('id', e.target.value)
                        handleSetCustomModel('name', e.target.value)
                    }}
                    placeholder="Enter LiteLLM Model ID"
                />
            </div>
            <div>
                <p className="text-lg mb-2">API Base</p>
                <Input
                    value={customModel.apiBaseUrl}
                    onChange={e =>
                        handleSetCustomModel('apiBaseUrl', e.target.value)
                    }
                    placeholder="Enter API Base URL"
                />
            </div>
            <div className="flex flex-col gap-2">
                <div className="flex justify-between w-full">
                    <div className="flex gap-1 items-center w-full">
                        <p className="text-lg">
                            {`${
                                customModel.name
                                    ? customModel.name
                                    : customModel.id
                            } API Key`}
                        </p>
                        <Popover>
                            <PopoverTrigger
                                className="ml-[2px]"
                            >
                                <CircleHelp size={14} />
                            </PopoverTrigger>
                            <SafeStoragePopoverContent />
                        </Popover>
                    </div>
                </div>
                <APIKeyComponent
                    model={customModel}
                    setOpen={setOpen}
                    setModelHasSavedApiKey={setModelHasSavedApiKey}
                    simple
                    disabled={!customModel.id || !customModel.apiBaseUrl}
                    isCustom
                    refetchModels={refetchModels}
                />
            </div>
        </div>
    )
}
