import axios from 'axios'
import { useState, useEffect } from 'react'
import { SessionMachineContext } from '@/contexts/session-machine-context'
import { UpdateConfig, AgentConfig } from '@/lib/types'

export const updateSessionConfig = async (
    host: string,
    name: string,
    config: UpdateConfig
) => {
    const response = await axios.patch(`${host}/sessions/${name}/update`, {
        model: config.model,
        api_key: config.api_key,
    })
    return response.data
}

const getSessionConfig = async (host: string, name: string) => {
    try {
        const response = await axios.get(`${host}/sessions/${name}/config`)
        return response.data
    } catch (error) {
        console.error('Error fetching session config:', error)
        throw error
    }
}

export const useSessionConfig = (host: string, name: string) => {
    const [config, setConfig] = useState<AgentConfig | null>(null)
    useEffect(() => {
        const interval = setInterval(() => {
            getSessionConfig(host, name).then(res => setConfig(res))
        }, 2000)
        // Clean up the interval when the component unmounts
        return () => clearInterval(interval)
    }, [host, name])
    return config
}

export const getCheckpointDiff = async (
    host: string,
    name: string,
    src_checkpoint_id: string, // commit hash
    dest_checkpoint_id: string // commit hash
) => {
    try {
        const response = await axios.get(
            `${host}/sessions/${name}/diff`,
            {
                params: {
                    src_checkpoint_id,
                    dest_checkpoint_id,
                },
            }
        )
        return response.data
    } catch (error) {
        console.error('Error fetching session config:', error)
        throw error
    }
}

// Not used yet
export async function getSessions(backendUrl: string) {
    if (!backendUrl) {
        return []
    }
    try {
        const response = await axios.get(`${backendUrl}/sessions`)
        return response.data
    } catch (error) {
        console.error('Error fetching sessions:', error)
        return []
    }
}
