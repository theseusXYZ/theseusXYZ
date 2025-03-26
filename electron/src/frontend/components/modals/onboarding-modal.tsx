import { useState, Suspense, lazy, useEffect } from 'react'
import { CircleHelp, Info } from 'lucide-react'
import { Input } from '@/components/ui/input'
import DisabledWrapper from '@/components/ui/disabled-wrapper'
import {
    SelectProjectDirectoryComponent,
    StartChatButton,
} from '@/components/modals/select-project-directory-modal'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import { useSafeStorage } from '@/lib/services/safeStorageService'
import SafeStoragePopoverContent from '@/components/modals/safe-storage-popover-content'
import Combobox from '@/components/ui/combobox'
import { useModels, ExtendedComboboxItem, addModel } from '@/lib/models'
import { Model } from '@/lib/types'

const Dialog = lazy(() =>
    import('@/components/ui/dialog').then(module => ({
        default: module.Dialog,
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

const OnboardingModal = ({
    setModelName,
    setOnboarded,
    afterOnboard,
}: {
    setModelName: (value: string) => void
    setOnboarded: (value: boolean) => void
    afterOnboard: (
        apiKey: string,
        modelName: string,
        folderPath: string
    ) => void
}) => {
    const [folderPath, setFolderPath] = useState('')
    const [apiKey, setApiKey] = useState('')

    const { addApiKey, getApiKey, setUseModelName } = useSafeStorage()
    const [isKeySaved, setIsKeySaved] = useState(false)
    const [hasClickedQuestion, setHasClickedQuestion] = useState(false)
    const { comboboxItems, selectedModel, setSelectedModel, refetchModels } = useModels()
    const [customModel, setCustomModel] = useState<Model>({
        id: '',
        name: '',
        company: '',
    })

    useEffect(() => {
        const fetchApiKey = async () => {
            if (!selectedModel) return
            const res = await getApiKey(selectedModel.value)
            // If it's already entered, don't let user edit
            if (res) {
                setApiKey(res)
                setIsKeySaved(true)
            } else {
                setApiKey('')
                setIsKeySaved(false)
            }
        }
        fetchApiKey()
    }, [selectedModel])

    const handleApiKeyInputChange = (
        e: React.ChangeEvent<HTMLInputElement>
    ) => {
        setApiKey(e.target.value)
    }

    function afterSubmit() {
        if (!selectedModel) return

        const handleSaveApiKey = async (model: ExtendedComboboxItem) => {
            await addApiKey(model.value, apiKey, false)
            setIsKeySaved(true)
            await setUseModelName(model.value, false)
        }
        let model = selectedModel
        if (selectedModel.value === 'custom') {
            model = {
                ...customModel,
                value: customModel.id,
                label: customModel.name,
            }
            refetchModels(true)
            // const config: UpdateConfig = {
            //     api_key: key,
            //     model: model.id,
            // }
            addModel(model)
            // await updateSessionConfig(host, name, config)
        }
        handleSaveApiKey(model) // Store the api key
        afterOnboard(apiKey, model.value, folderPath)
        setOnboarded(true) // Makes sure the other modal doesn't show up
        setModelName(selectedModel.value) // Closes the modal
    }

    function validateFields() {
        // if (!isChecked) return false
        if (selectedModel?.id === 'custom') {
            if (!customModel.id) return false
            if (!customModel.name) return false
            if (!customModel.apiBaseUrl) return false
        }
        return (apiKey !== '' || isKeySaved) && folderPath !== ''
    }

    return (
        <Suspense fallback={<></>}>
            <Dialog open={true}>
                <DialogContent
                    hideclose={true.toString()}
                    className="w-[500px]"
                >
                    <div className="flex flex-col items-center justify-center my-8 mx-8">
                        <DialogHeader>
                            <DialogTitle className="text-3xl font-bold">
                                Welcome to theseus!
                            </DialogTitle>
                        </DialogHeader>
                        <DisabledWrapper
                            disabled={false}
                            className="mt-10 w-full"
                        >
                            <SelectProjectDirectoryComponent
                                folderPath={folderPath}
                                setFolderPath={setFolderPath}
                            />
                        </DisabledWrapper>
                        <DisabledWrapper disabled={false} className="w-full">
                            <div className="flex flex-col mt-10 w-full">
                                <div className="flex flex-col mb-5">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="text-lg font-semibold">
                                            {`Choose your model:`}
                                        </p>
                                        {selectedModel && setSelectedModel && (
                                            <Combobox
                                                items={comboboxItems}
                                                itemType="model"
                                                selectedItem={selectedModel}
                                                setSelectedItem={
                                                    setSelectedModel
                                                }
                                            />
                                        )}
                                    </div>
                                    {selectedModel?.value !==
                                        'claude-3-5-sonnet' && (
                                        <span className="text-sm text-green-500 mt-2 flex gap-1 items-center">
                                            <Info className="w-4 h-4" />
                                            Note: For best results use Claude
                                            3.5 Sonnet (it's better at coding!)
                                        </span>
                                    )}
                                </div>

                                {selectedModel?.id === 'custom' && (
                                    <EnterCustomModel customModel={customModel} setCustomModel={setCustomModel} />
                                )}
                                {selectedModel?.id !== 'custom' && (
                                    <div className="flex gap-1 items-center mb-4">
                                        <p className="text-lg font-bold">
                                            {`${selectedModel?.company} API Key`}
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
                                            {isKeySaved ? (
                                                <PopoverContent
                                                    side="top"
                                                    className="bg-night w-fit p-2"
                                                >
                                                    To edit, go to settings
                                                </PopoverContent>
                                            ) : (
                                                <SafeStoragePopoverContent />
                                            )}
                                        </Popover>
                                        {hasClickedQuestion && !apiKey && (
                                            <a
                                                className="text-primary hover:underline self-end ml-auto cursor-pointer"
                                                href={selectedModel?.apiKeyUrl}
                                                target="_blank"
                                            >
                                                Looking for an API key?
                                            </a>
                                        )}
                                    </div>
                                )}
                                <Input
                                    className={`w-full ${selectedModel?.id === 'custom' ? 'mt-2' : ''}`}
                                    placeholder={selectedModel?.id === 'custom' ? 'Enter your API Key' : ''}
                                    type="password"
                                    value={
                                        isKeySaved
                                            ? '******************************'
                                            : apiKey
                                    }
                                    onChange={handleApiKeyInputChange}
                                    disabled={isKeySaved}
                                />
                            </div>
                        </DisabledWrapper>
                        <StartChatButton
                            disabled={!validateFields()}
                            onClick={afterSubmit}
                            folderPath={folderPath}
                        />
                    </div>
                </DialogContent>
            </Dialog>
        </Suspense>
    )
}

export default OnboardingModal

const EnterCustomModel = ({
    customModel,
    setCustomModel,
}: {
    customModel: Model
    setCustomModel: React.Dispatch<React.SetStateAction<Model>>
}) => {
    
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
                            onClick={() =>
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
                            <PopoverTrigger className="ml-[2px]">
                                <CircleHelp size={14} />
                            </PopoverTrigger>
                            <SafeStoragePopoverContent />
                        </Popover>
                    </div>
                </div>
            </div>
        </div>
    )
}
