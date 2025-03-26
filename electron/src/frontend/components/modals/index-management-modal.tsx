import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CardContent, Card } from '@/components/ui/card'
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogHeader,
} from '@/components/ui/dialog'
import FolderPicker from '@/components/ui/folder-picker'
import axios from 'axios'
import { SessionMachineContext } from '@/contexts/session-machine-context'
import { Check, Info } from 'lucide-react'
import CircleSpinner from '@/components/ui/circle-spinner/circle-spinner'
import { useSafeStorage } from '@/lib/services/safeStorageService'
import { useToast } from '@/components/ui/use-toast'
import DisabledWrapper from '@/components/ui/disabled-wrapper'

const API_KEYS = {
    ANTHROPIC: 'claude-3-5-sonnet',
    OPENAI: 'gpt4-o',
}

const IndexManagementModal = ({
    isOpen,
    setOpen,
    folderPath,
}: {
    isOpen: boolean
    setOpen: (isOpen: boolean) => void
    folderPath: string
}) => {
    const isSpecificIndex = !!folderPath
    const [requirementsMet, setRequirementsMet] = useState(false)
    return (
        <Dialog open={isOpen} onOpenChange={setOpen}>
            <DialogContent className="min-w-[500px]">
                <DialogHeader className="mx-auto">
                    <DialogTitle>
                        <h1 className="text-2xl font-bold">
                            {isSpecificIndex
                                ? 'Create New Index'
                                : 'Project Indexes'}
                        </h1>
                    </DialogTitle>
                </DialogHeader>
                <div className="pb-2 flex flex-col gap-5">
                    <RequiredApiKeysCard
                        setRequirementsMet={setRequirementsMet}
                    />
                    <DisabledWrapper disabled={!requirementsMet}>
                        {isSpecificIndex ? (
                            <AddNewIndexCard folderPath={folderPath} />
                        ) : (
                            <IndexesListCard />
                        )}
                    </DisabledWrapper>
                </div>
            </DialogContent>
        </Dialog>
    )
}

const RequiredApiKeysCard = ({
    setRequirementsMet,
}: {
    setRequirementsMet: (requirementsMet: boolean) => void
}) => {
    const { getApiKey, addApiKey } = useSafeStorage()

    const [initialApiKeys, setInitialApiKeys] = useState({
        [API_KEYS.ANTHROPIC]: false,
        [API_KEYS.OPENAI]: false,
    })

    const [inputApiKeys, setInputApiKeys] = useState({
        [API_KEYS.ANTHROPIC]: '',
        [API_KEYS.OPENAI]: '',
    })

    const fetchApiKeys = useCallback(async () => {
        const anthropic = await getApiKey(API_KEYS.ANTHROPIC)
        const openai = await getApiKey(API_KEYS.OPENAI)
        const newApiKeys = {
            [API_KEYS.ANTHROPIC]: !!anthropic,
            [API_KEYS.OPENAI]: !!openai,
        }
        setInitialApiKeys(newApiKeys)
        setRequirementsMet(
            newApiKeys[API_KEYS.ANTHROPIC] && newApiKeys[API_KEYS.OPENAI]
        )
    }, [getApiKey, setRequirementsMet])

    useEffect(() => {
        fetchApiKeys()
    }, [])

    const handleApiKeyChange = (key: string, value: string) => {
        setInputApiKeys(prev => ({ ...prev, [key]: value }))
    }

    const handleApiKeySave = async (key: string) => {
        // await addApiKey(key, inputApiKeys[key])
        setInitialApiKeys(prev => ({ ...prev, [key]: true }))

        const newApiKeys = { ...initialApiKeys, [key]: true }
        setRequirementsMet(
            newApiKeys[API_KEYS.ANTHROPIC] && newApiKeys[API_KEYS.OPENAI]
        )
    }

    const getSetApiKeysCount = () => {
        return Object.values(initialApiKeys).filter(key => key).length
    }

    const renderApiKeyInput = (keyName: string, displayName: string) => (
        <div className="mb-4">
            <div className="flex gap-1 items-center">
                <p className="text-md">{displayName}</p>
                {initialApiKeys[keyName] && (
                    <Check className="text-green-500" size={16} />
                )}
            </div>
            {!initialApiKeys[keyName] && (
                <div className="flex items-center gap-2 mt-2">
                    <Input
                        type="password"
                        value={inputApiKeys[keyName]}
                        onChange={e =>
                            handleApiKeyChange(keyName, e.target.value)
                        }
                        placeholder={`Enter ${displayName}`}
                    />
                    <Button onClick={() => handleApiKeySave(keyName)}>
                        Save
                    </Button>
                </div>
            )}
        </div>
    )

    return (
        <Card className="bg-midnight">
            <CardContent className="mt-5 w-full pb-2">
                <h2 className="text-lg font-semibold mb-4">
                    Required API Keys ({getSetApiKeysCount()}/
                    {Object.keys(API_KEYS).length})
                </h2>
                {renderApiKeyInput(API_KEYS.ANTHROPIC, 'Anthropic API Key')}
                {renderApiKeyInput(API_KEYS.OPENAI, 'OpenAI API Key')}
            </CardContent>
        </Card>
    )
}

const AddNewIndexCard = ({ folderPath }: { folderPath: string }) => {
    const { toast } = useToast()
    const host = SessionMachineContext.useSelector(state => state.context.host)
    const [indexes, setIndexes] = useState([])
    const [newIndexPath, setNewIndexPath] = useState(folderPath)
    const [error, setError] = useState<string | null>(null)

    const fetchIndexes = useCallback(async () => {
        try {
            const response = await axios.get(`${host}/indexes`)
            setIndexes(response.data)
        } catch (error) {
            console.error('Failed to fetch indexes:', error)
            setError('Failed to fetch indexes. Please try again.')
        }
    }, [host])

    useEffect(() => {
        fetchIndexes()
    }, [])

    const handleRemoveIndex = async (path: string) => {
        try {
            const encodedPath = encodeURIComponent(path.replace(/\//g, '%2F'))
            await axios.delete(`${host}/indexes/${encodedPath}`)
            setIndexes(indexes.filter(index => index.path !== path))
            toast({ title: 'Index removed successfully' })
        } catch (error) {
            console.error('Failed to remove index:', error)
            setError('Failed to remove index. Please try again.')
        }
    }

    const handleAddIndex = async () => {
        if (newIndexPath) {
            try {
                setError(null)
                const encodedPath = encodeURIComponent(
                    newIndexPath.replace(/\//g, '%2F')
                )
                await axios.delete(`${host}/indexes/${encodedPath}`)
                await axios.post(`${host}/indexes/${encodedPath}`)
                setIndexes([
                    ...indexes,
                    { path: newIndexPath, status: 'running' },
                ])
                setNewIndexPath('')
                toast({ title: 'Index added successfully' })
            } catch (error) {
                console.error('Failed to add index:', error)
                setError('Failed to add index. Please try again.')
            }
        }
    }
    return (
        <Card className="bg-midnight">
            <CardContent className="mt-5 w-full">
                <h2 className="text-lg font-semibold mb-4">Add a new index</h2>
                <div className="flex items-center mb-2 gap-4">
                    <FolderPicker
                        folderPath={newIndexPath}
                        setFolderPath={setNewIndexPath}
                        showTitle={false}
                        buttonClassName="px-5"
                        hideButton
                    />
                    {newIndexPath && (
                        <Button onClick={handleAddIndex}>
                            Create an Index
                        </Button>
                    )}
                </div>
                <span className="text-sm text-neutral-500 mt-3 flex gap-1 items-center">
                    Cost estimate: 123 tokens
                </span>
                {error && <div className="text-red-500 mb-2 mt-6">{error}</div>}
            </CardContent>
        </Card>
    )
}

const IndexesListCard = () => {
    const { toast } = useToast()
    const host = SessionMachineContext.useSelector(state => state.context.host)
    const [indexes, setIndexes] = useState([])
    const [newIndexPath, setNewIndexPath] = useState('')
    const [error, setError] = useState<string | null>(null)

    const fetchIndexes = useCallback(async () => {
        try {
            const response = await axios.get(`${host}/indexes`)
            setIndexes(response.data)
        } catch (error) {
            console.error('Failed to fetch indexes:', error)
            setError('Failed to fetch indexes. Please try again.')
        }
    }, [host])

    useEffect(() => {
        fetchIndexes()
    }, [])

    const handleRemoveIndex = async (path: string) => {
        try {
            const encodedPath = encodeURIComponent(path.replace(/\//g, '%2F'))
            await axios.delete(`${host}/indexes/${encodedPath}`)
            setIndexes(indexes.filter(index => index.path !== path))
            toast({ title: 'Index removed successfully' })
        } catch (error) {
            console.error('Failed to remove index:', error)
            setError('Failed to remove index. Please try again.')
        }
    }

    const handleAddIndex = async () => {
        if (newIndexPath) {
            try {
                setError(null)
                const encodedPath = encodeURIComponent(
                    newIndexPath.replace(/\//g, '%2F')
                )
                await axios.delete(`${host}/indexes/${encodedPath}`)
                await axios.post(`${host}/indexes/${encodedPath}`)
                setIndexes([
                    ...indexes,
                    { path: newIndexPath, status: 'running' },
                ])
                setNewIndexPath('')
                toast({ title: 'Index added successfully' })
            } catch (error) {
                console.error('Failed to add index:', error)
                setError('Failed to add index. Please try again.')
            }
        }
    }
    return (
        <Card className="bg-midnight">
            <CardContent className="mt-5 w-full">
                <h2 className="text-lg font-semibold mb-4">
                    Directory indexes
                </h2>
                <div className="flex items-center mb-2 gap-4">
                    <FolderPicker
                        folderPath={newIndexPath}
                        setFolderPath={setNewIndexPath}
                        showTitle={false}
                        buttonClassName="px-5"
                    />
                    {newIndexPath && (
                        <Button onClick={handleAddIndex}>
                            Create an Index
                        </Button>
                    )}
                </div>
                {error && <div className="text-red-500 mb-2 mt-6">{error}</div>}
                {indexes.length > 0 && (
                    <div className="mt-6">
                        {indexes.map(index => (
                            <div
                                key={index.path}
                                className="flex items-center justify-between mb-2"
                            >
                                <span>{index.path}</span>
                                {index.status === 'running' && (
                                    <CircleSpinner />
                                )}
                                {index.status === 'done' && (
                                    <Check className="text-green-500" />
                                )}
                                {index.status === 'error' && (
                                    <span className="text-red-500">Error</span>
                                )}
                                <Button
                                    onClick={() =>
                                        handleRemoveIndex(index.path)
                                    }
                                    variant="destructive"
                                    size="sm"
                                >
                                    Remove
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

export default IndexManagementModal
