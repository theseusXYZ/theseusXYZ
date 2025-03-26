import { useState, useEffect, useCallback } from 'react'
import { SessionMachineContext } from '@/contexts/session-machine-context'
import { ComboboxItem } from '@/components/ui/combobox'
import { Model } from './types'
import { useSessionConfig } from '@/lib/services/sessionService/sessionService'

const defaultModels: Model[] = [
    {
        id: 'claude-3-5-sonnet',
        name: 'Claude 3.5 Sonnet',
        company: 'Anthropic',
        apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    },
    {
        id: 'gpt4-o',
        name: 'GPT-4o',
        company: 'OpenAI',
        apiKeyUrl: 'https://platform.openai.com/api-keys',
    },
    {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        company: 'OpenAI',
        apiKeyUrl: 'https://platform.openai.com/api-keys',
    },
    // {
    //     id: 'llama-3-70b',
    //     name: 'Groq Llama 3 70B',
    //     company: 'Groq',
    // },
    // {
    //     id: 'ollama/deepseek-coder:6.7b',
    //     name: 'Ollama Deepseek 6.7b',
    //     company: 'Ollama',
    // },
]

const customOption = {
    id: 'custom',
    name: 'Custom (LiteLLM)',
    company: 'LiteLLM',
}

async function getSavedModels(): Promise<Model[]> {
    const res = await window.api.invoke('get-user-setting', 'models')
    if (res.success) {
        return res.data
    }
    return []
}

export async function addModel(model: Model): Promise<void> {
    const data = {
        setting: 'models',
        value: {
            ...model,
            isCustom: true,
        },
    }
    await window.api.invoke('set-user-setting', data)
}

export async function removeModel(model: Model): Promise<void> {
    try {
        // Get the current models
        const res = await getSavedModels()

        let currentModels: Model[] = res || []

        // Filter out the model to be removed
        const updatedModels = currentModels.filter(
            (existingModel: Model) => existingModel.id !== model.id
        )
        // Save the updated models array
        const data = {
            setting: 'models',
            value: updatedModels,
        }
        const updateRes = await window.api.invoke('set-user-setting', data)
        if (!updateRes.success) {
            throw new Error('Failed to update models')
        }
    } catch (error) {
        console.error('Error removing model:', error)
        throw error
    }
}

export async function getAllModels(): Promise<Model[]> {
    const savedModels = await getSavedModels()

    // Combine default models with saved models, giving priority to saved models
    const allModels = [...defaultModels]
    if (savedModels) {
        savedModels.forEach(savedModel => {
            const index = allModels.findIndex(
                model => model.id === savedModel.id
            )
            if (index !== -1) {
                // Replace the default model with the saved one
                allModels[index] = savedModel
            } else {
                // Add the new saved model
                allModels.push(savedModel)
            }
        })
    }

    return allModels
}

export type ExtendedComboboxItem = ComboboxItem & Model

export const useModels = () => {
    const backupModel = defaultModels[0]
    const [comboboxItems, setComboboxItems] = useState<ExtendedComboboxItem[]>(
        []
    )
    const [selectedModel, setSelectedModel] =
        useState<ExtendedComboboxItem | null>(null)
    const [models, setModels] = useState<Model[]>([])
    const host = SessionMachineContext.useSelector(state => state.context.host)
    const name = SessionMachineContext.useSelector(state => state.context.name)
    const config = useSessionConfig(host, name)

    const fetchModels = useCallback(
        async (addDelay: boolean = false) => {
            try {
                if (addDelay) {
                    await new Promise(resolve => setTimeout(resolve, 2000))
                }
                const allModels = await getAllModels()
                setModels(allModels)

                const modelsWithCustom = [...allModels]
                const items: ExtendedComboboxItem[] = modelsWithCustom
                    .filter(model => !model.comingSoon)
                    .map(model => ({
                        ...model,
                        value: model.id,
                        label: model.name,
                    }))

                setComboboxItems(items)
                if (!selectedModel) {
                    if (config?.model) {
                        const selectedModel = items.find(
                            item => item.value === config.model
                        )
                        if (selectedModel) {
                            setSelectedModel(selectedModel)
                            return
                        }
                    }
                    setSelectedModel(items[0]) // Set the first item as default if none selected
                }
            } catch (error) {
                console.error('Failed to fetch models:', error)
            }
        },
        [selectedModel, config?.model]
    )

    useEffect(() => {
        fetchModels()
    }, [fetchModels])

    return {
        models,
        comboboxItems,
        selectedModel,
        setSelectedModel,
        refetchModels: fetchModels,
        backupModel,
    }
}
