export type File<T = any> = {
    id: string
    name: string
    path: string
    language: string
    value: T
    icon?: string
    agentHasOpen?: boolean
}

export type Model = {
    id: string
    name: string
    company: string
    comingSoon?: boolean
    apiKeyUrl?: string
    apiBaseUrl?: string
    isCustom?: boolean
}

export type Message = {
    text: string
    type:
        | 'user'
        | 'agent'
        | 'command'
        | 'tool'
        | 'task'
        | 'thought'
        | 'error'
        | 'shellCommand'
        | 'shellResponse'
        | 'rateLimit'
        | 'checkpoint'
}

// Make sure this is up-to-date with server.py @app.get("/sessions/{session}/config")
export type AgentConfig = {
    model: string
    versioning_type: string
    checkpoints: Checkpoint[]
    versioning_metadata: VersioningMetadata
}

export type Checkpoint = {
    commit_hash: string
    commit_message: string
    agent_history: any[]
    event_id: number
    checkpoint_id: string
    index: number
}

export type VersioningMetadata = {
    current_branch: string
    old_branch: string
    initial_commit: string
}

// Make sure this is up-to-date with server.py @app.patch("/sessions/{session}/update")
export type UpdateConfig = {
    model: string
    api_key: string
}

export type CheckpointTracker = {
    initial: Checkpoint
    current: Checkpoint
    selected: Checkpoint | null
    consumeCommitMessage?: string
}
